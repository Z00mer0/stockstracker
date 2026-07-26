// frontend-react/src/hooks/usePortfolioMetrics.js
import { useState, useEffect } from 'react';
import { authHeader } from '../utils/auth.js';

const CACHE_KEY = 'portfolio_metrics_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// ── XIRR ────────────────────────────────────────────────────────────────────
// cashFlows: [{ date: 'YYYY-MM-DD', amount: number }]
// Returns annualised rate as percentage (e.g. 12.0 = 12%), or null if can't converge
export function calcXIRR(cashFlows) {
  if (!cashFlows || cashFlows.length < 2) return null;
  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = new Date(sorted[0].date).getTime();

  function npv(r) {
    return sorted.reduce((sum, cf) => {
      const t = (new Date(cf.date).getTime() - t0) / (365.25 * 86400 * 1000);
      return sum + cf.amount / Math.pow(1 + r, t);
    }, 0);
  }

  let r = 0.1;
  for (let i = 0; i < 300; i++) {
    const f = npv(r);
    const df = (npv(r + 0.0001) - f) / 0.0001;
    if (Math.abs(df) < 1e-10) break;
    const next = r - f / df;
    if (Math.abs(next - r) < 1e-8) { r = next; break; }
    r = Math.max(-0.99, next);
  }
  if (!isFinite(r) || r <= -0.99) return null;
  // Samo zakończenie pętli nic nie znaczy: przy płaskim NPV (np. pozycja
  // wyzerowana, bo ceny się nie załadowały) pochodna jest zerowa, pętla
  // przerywa się w pierwszym kroku i na zewnątrz wyciekało `r` = 0.1, czyli
  // "+10%" na inwestycji wartej zero. Wynik uznajemy tylko wtedy, gdy NPV
  // faktycznie wyszło na zero — w skali samych przepływów, bo bezwzględny
  // próg znaczyłby co innego dla portfela za 1 tys. i za 1 mln.
  const scale = sorted.reduce((s, cf) => s + Math.abs(cf.amount), 0);
  if (scale > 0 && Math.abs(npv(r)) > 1e-4 * scale) return null;
  return r * 100;
}

// ── Period formatter ─────────────────────────────────────────────────────────
export function fmtPeriod(days) {
  if (days == null) return '—';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30.4)}mo`;
  return `${(days / 365).toFixed(1)}yr`;
}

// ── Stooq CSV fallback — works without auth, no CORS issues via proxy ────────
async function fetchStooqPrice(sym) {
  // PKN.WA → pkn, HOOD → hood.us
  const stooqSym = sym.endsWith('.WA')
    ? sym.slice(0, -3).toLowerCase()
    : sym.toLowerCase() + '.us';
  const url = `https://stooq.com/q/l/?s=${stooqSym}&f=sd2ohlcv&h&e=csv`;
  try {
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000), headers: authHeader() });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;
    const cols = lines[1].split(',');
    const close = parseFloat(cols[5]); // Symbol,Date,Open,High,Low,Close,Volume
    return close > 0 ? close : null;
  } catch { return null; }
}

// ── Yahoo Finance — Vercel serverless function (different IP, no auth needed) ─
// Cała paczka symboli jednym zapytaniem; funkcja po stronie Vercela odpytuje
// Yahoo równolegle. Zwraca mapę symbol → dane, null przy błędzie przejściowym,
// { notFound: true } gdy symbol nigdzie nie istnieje.
const YQ_CHUNK = 60;   // limit przyjmowany przez api/quotes.js

async function fetchYahooBatch(symbols) {
  const out = {};
  const chunks = [];
  for (let i = 0; i < symbols.length; i += YQ_CHUNK) chunks.push(symbols.slice(i, i + YQ_CHUNK));

  await Promise.allSettled(chunks.map(async (chunk) => {
    try {
      const url = `/api/quotes?format=map&symbols=${chunk.map(encodeURIComponent).join(',')}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { quotes } = await res.json();
      for (const sym of chunk) {
        const e = quotes?.[sym];
        if (!e)          { out[sym] = null; continue; }
        if (e.notFound)  { out[sym] = { notFound: true }; continue; }
        if (e.stooq)     { out[sym] = { price: e.price, dailyChg: null, pe: null, peFwd: null, pb: null }; continue; }
        const q = e.quote;
        out[sym] = q?.regularMarketPrice
          ? { price: q.regularMarketPrice, dailyChg: q.regularMarketChangePercent ?? null,
              pe: null, peFwd: null, pb: null, sector: null, earningsTs: null }
          : null;
      }
    } catch {
      // Cała paczka padła (Vercel niedostępny) — wracamy do proxy Rendera,
      // dokładnie tak jak robił to poprzedni fallback, tylko dla tych symboli.
      const settled = await Promise.allSettled(chunk.map(fetchStooqPrice));
      chunk.forEach((sym, i) => {
        const price = settled[i].status === 'fulfilled' ? settled[i].value : null;
        out[sym] = price ? { price, dailyChg: null, pe: null, peFwd: null, pb: null } : null;
      });
    }
  }));
  return out;
}

// ── Finnhub — jedno zapytanie na paczkę zamiast dwóch na spółkę ──────────────
const FH_CHUNK = 60;   // _FH_BATCH_MAX po stronie serwera

async function fetchFinnhubBatch(symbols) {
  const out = {};
  const chunks = [];
  for (let i = 0; i < symbols.length; i += FH_CHUNK) chunks.push(symbols.slice(i, i + FH_CHUNK));

  await Promise.allSettled(chunks.map(async (chunk) => {
    const url = `/api/finnhub-batch?symbols=${chunk.map(encodeURIComponent).join(',')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(25000), headers: authHeader() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    Object.assign(out, await res.json());
  }));
  return out;   // brak wpisu = Yahoo poniżej i tak dołoży cenę
}

// ── CoinGecko crypto prices ───────────────────────────────────────────────────
async function fetchCryptoPrice(symbol) {
  try {
    const res = await fetch(`/api/crypto-price?symbols=${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data[symbol.toUpperCase()];
    if (!entry) return null;
    return {
      price:    entry.usd ?? null,
      dailyChg: entry.change24h ?? null,
      pe: null, peFwd: null, pb: null, sector: 'Cryptocurrency',
    };
  } catch { return null; }
}

// ── Hardcoded sectors for GPW (.WA) — Yahoo Finance v7 returns 401 for PL tickers ──
const WA_SECTOR_MAP = {
  'XTB.WA':  'Financial Services',
  'PKN.WA':  'Energy',
  'ALE.WA':  'Technology',
  'CDR.WA':  'Technology',
  'PKO.WA':  'Financial Services',
  'PEO.WA':  'Financial Services',
  'PZU.WA':  'Financial Services',
  'LPP.WA':  'Consumer Cyclical',
  'DNP.WA':  'Consumer Defensive',
  'KGH.WA':  'Basic Materials',
  'JSW.WA':  'Basic Materials',
  'CPS.WA':  'Technology',
  'MDV.WA':  'Consumer Cyclical',
  'OPL.WA':  'Communication Services',
  'MBK.WA':  'Financial Services',
  'PCO.WA':  'Technology',
  'SPL.WA':  'Financial Services',
  'TEN.WA':  'Consumer Cyclical',
  'MRC.WA':  'Consumer Cyclical',
  'CCC.WA':  'Consumer Cyclical',
  'AMC.WA':  'Consumer Defensive',
  'ING.WA':  'Financial Services',
  'BNP.WA':  'Financial Services',
  'MRB.WA':  'Real Estate',
  'DIA.WA':  'Healthcare',
  'PXM.WA':  'Industrials',
  'S2B.WA':  'Technology',
  'CBF.WA':  'Technology',
  'ELT.WA':  'Technology',
  'EUR.WA':  'Consumer Defensive',
  'BDX.WA':  'Technology',
  '11B.WA':  'Technology',
  'VRG.WA':  'Consumer Cyclical',
  'MOL.WA':  'Energy',
  'GPW.WA':  'Financial Services',
  'ATD.WA':  'Healthcare',
  'SGN.WA':  'Technology',
  'PHN.WA':  'Real Estate',
  'PLW.WA':  'Consumer Cyclical',
  'AMR.WA':  'Healthcare',
};

// ── Hardcoded sectors for popular US stocks — fallback when Yahoo doesn't return sector ──
const US_SECTOR_MAP = {
  // Technology
  'AAPL': 'Technology', 'MSFT': 'Technology', 'NVDA': 'Technology', 'AMD': 'Technology',
  'INTC': 'Technology', 'ADBE': 'Technology', 'ORCL': 'Technology', 'CRM': 'Technology',
  'AVGO': 'Technology', 'SNOW': 'Technology', 'PANW': 'Technology', 'CRWD': 'Technology',
  'NET': 'Technology', 'ZS': 'Technology', 'DDOG': 'Technology', 'OKTA': 'Technology',
  'NOW': 'Technology', 'WDAY': 'Technology', 'TEAM': 'Technology', 'MDB': 'Technology',
  'ARM': 'Technology', 'PLTR': 'Technology', 'PATH': 'Technology', 'DT': 'Technology',
  'GTLB': 'Technology', 'S': 'Technology', 'SPLK': 'Technology', 'VEEV': 'Technology',
  'DOCU': 'Technology', 'TWLO': 'Technology',
  // Communication Services
  'META': 'Communication Services', 'GOOGL': 'Communication Services', 'GOOG': 'Communication Services',
  'NFLX': 'Communication Services', 'SPOT': 'Communication Services', 'SNAP': 'Communication Services',
  'T': 'Communication Services', 'VZ': 'Communication Services', 'DIS': 'Communication Services',
  'CMCSA': 'Communication Services', 'RBLX': 'Communication Services',
  // Consumer Cyclical
  'AMZN': 'Consumer Cyclical', 'TSLA': 'Consumer Cyclical', 'BABA': 'Consumer Cyclical',
  'MELI': 'Consumer Cyclical', 'SHOP': 'Consumer Cyclical', 'ABNB': 'Consumer Cyclical',
  'UBER': 'Consumer Cyclical', 'LYFT': 'Consumer Cyclical', 'NKE': 'Consumer Cyclical',
  'MCD': 'Consumer Cyclical', 'SBUX': 'Consumer Cyclical', 'HD': 'Consumer Cyclical',
  'LOW': 'Consumer Cyclical', 'TGT': 'Consumer Cyclical',
  // Consumer Defensive
  'PG': 'Consumer Defensive', 'KO': 'Consumer Defensive', 'PEP': 'Consumer Defensive',
  'WMT': 'Consumer Defensive', 'COST': 'Consumer Defensive',
  // Financial Services
  'HOOD': 'Financial Services', 'SOFI': 'Financial Services', 'IBKR': 'Financial Services',
  'COIN': 'Financial Services', 'SQ': 'Financial Services', 'PYPL': 'Financial Services',
  'JPM': 'Financial Services', 'GS': 'Financial Services', 'MS': 'Financial Services',
  'BAC': 'Financial Services', 'WFC': 'Financial Services', 'C': 'Financial Services',
  'V': 'Financial Services', 'MA': 'Financial Services',
  // Healthcare
  'HIMS': 'Healthcare', 'OSCR': 'Healthcare', 'UNH': 'Healthcare', 'NVO': 'Healthcare',
  'JNJ': 'Healthcare', 'ABBV': 'Healthcare', 'PFE': 'Healthcare', 'MRK': 'Healthcare',
  'LLY': 'Healthcare', 'AMGN': 'Healthcare', 'GILD': 'Healthcare', 'BIIB': 'Healthcare',
  'REGN': 'Healthcare', 'CVS': 'Healthcare',
  // Real Estate
  'ARE': 'Real Estate',
  // Energy
  'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy',
  // Industrials
  'BA': 'Industrials', 'GE': 'Industrials', 'LMT': 'Industrials', 'RTX': 'Industrials',
  // Auto
  'RIVN': 'Consumer Cyclical', 'LCID': 'Consumer Cyclical', 'NIO': 'Consumer Cyclical',
  'F': 'Consumer Cyclical', 'GM': 'Consumer Cyclical',
};

async function fetchFinnhubEarningsTs(sym) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const url = `/api/finnhub/v1/calendar/earnings?from=${today}&to=${future}&symbol=${sym}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: authHeader() });
    if (!res.ok) return null;
    const json = await res.json();
    const events = json?.earningsCalendar ?? [];
    return events.length > 0 ? new Date(events[0].date).getTime() / 1000 : null;
  } catch { return null; }
}

// ── Finnhub fetch (with Yahoo Finance fallback for missing prices) ────────────
// Returns results map; symbols with notFound:true are definitely unavailable (skip retry)
async function fetchAllMetrics(symbols) {
  const results     = {};
  const usSymbols   = symbols.filter(s => !s.includes('.'));
  const nonUs       = symbols.filter(s =>  s.includes('.'));

  const [fh, yqNonUs] = await Promise.all([
    usSymbols.length ? fetchFinnhubBatch(usSymbols) : Promise.resolve({}),
    nonUs.length     ? fetchYahooBatch(nonUs)       : Promise.resolve({}),
  ]);

  // Non-US exchange (GPW .WA, LSE .L, etc.) — Yahoo Finance for price/fundamentals
  for (const sym of nonUs) {
    const yq = yqNonUs[sym];
    if (yq?.notFound) { results[sym] = { price: null, notFound: true }; continue; }
    let sector = yq?.sector ?? null;
    if (sym.endsWith('.WA')) sector = sector ?? WA_SECTOR_MAP[sym] ?? null;
    results[sym] = {
      price:      yq?.price      ?? null,
      dailyChg:   yq?.dailyChg   ?? null,
      pe:         yq?.pe         ?? null,
      peFwd:      yq?.peFwd      ?? null,
      pb:         yq?.pb         ?? null,
      sector:     sector ?? US_SECTOR_MAP[sym] ?? WA_SECTOR_MAP[sym] ?? null,
      earningsTs: yq?.earningsTs ?? null,
    };
  }

  // US stocks — Finnhub primary, Yahoo fallback for price + fundamentals
  const rows = {};
  const needFallback = [];
  for (const sym of usSymbols) {
    const q = fh[sym]?.quote ?? null;
    const m = fh[sym]?.metric?.metric ?? null;
    const row = {
      price:      (q?.c > 0) ? q.c : null,
      dailyChg:   (q?.dp != null && q.c > 0) ? q.dp : null,
      pe:         m?.peBasicExclExtraTTM ?? null,
      peFwd:      m?.peForwardDiluted    ?? null,
      pb:         m?.pbAnnual            ?? null,
      sector:     null,
      earningsTs: null,
    };
    rows[sym] = row;
    // Tylko brak ceny. Warunek na pe/sector wygladal sensownie, ale byl nie do
    // spelnienia: fetchYahooBatch zwraca pe/peFwd/pb/sector/earningsTs zawsze
    // jako null (funkcja Vercela oddaje sam kurs), a sector i tak dokladamy
    // nizej z US_SECTOR_MAP. Efekt byl taki, ze KAZDY symbol US szedl jeszcze
    // raz przez /api/quotes, mimo ze Finnhub podal juz komplet.
    if (row.price == null) needFallback.push(sym);
  }
  const yqUs = needFallback.length ? await fetchYahooBatch(needFallback) : {};
  for (const sym of usSymbols) {
    const row = rows[sym];
    const yq  = yqUs[sym];
    if (yq && !yq.notFound) {
      row.price      = row.price      ?? yq.price      ?? null;
      row.dailyChg   = row.dailyChg   ?? yq.dailyChg   ?? null;
      row.pe         = row.pe         ?? yq.pe         ?? null;
      row.peFwd      = row.peFwd      ?? yq.peFwd      ?? null;
      row.pb         = row.pb         ?? yq.pb         ?? null;
      row.sector     = row.sector     ?? yq.sector     ?? null;
      row.earningsTs = row.earningsTs ?? yq.earningsTs ?? null;
    }
    row.sector = row.sector ?? US_SECTOR_MAP[sym] ?? WA_SECTOR_MAP[sym] ?? null;
    results[sym] = row;
  }
  return results;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
const CRYPTO_SYMBOLS = new Set([
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','MATIC','DOT','SHIB',
  'AVAX','LINK','UNI','LTC','BCH','ATOM','XLM','NEAR','APT','ARB',
  'OP','INJ','SUI','TRX','TON','PEPE','WIF',
]);

export function usePortfolioMetrics(portfolio, transactions, fxRates) {
  const [marketData, setMarketData] = useState({});
  const [metricsLoading, setMetricsLoading] = useState(false);

  const symbolsKey = portfolio.map(p => p.symbol).sort().join(',');

  useEffect(() => {
    if (!portfolio.length) return;

    const cacheKey = `${CACHE_KEY}_${symbolsKey}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached?.ts && Date.now() - cached.ts < CACHE_TTL) {
        setMarketData(cached.data);
        return;
      }
    } catch {}

    const allSymbols = [...new Set(portfolio.map(p => p.symbol))];
    const cryptoSet = new Set(portfolio.filter(p => p.assetType === 'crypto' || CRYPTO_SYMBOLS.has(p.symbol)).map(p => p.symbol));
    const regularSymbols = allSymbols.filter(s => !cryptoSet.has(s));
    const cryptoSymbols  = allSymbols.filter(s => cryptoSet.has(s));
    setMetricsLoading(true);
    Promise.all([
      regularSymbols.length > 0 ? fetchAllMetrics(regularSymbols) : Promise.resolve({}),
      ...cryptoSymbols.map(s => fetchCryptoPrice(s).then(m => ({ [s]: m ?? { price: null, dailyChg: null, pe: null, peFwd: null, pb: null, sector: 'Cryptocurrency' } }))),
    ]).then(async ([regularData, ...cryptoResults]) => {
        const cryptoData = Object.assign({}, ...cryptoResults);
        const data = { ...regularData, ...cryptoData };
        setMarketData(data);
        // Retry only regular symbols with temporary failures (skip notFound — they don't exist)
        const failed = regularSymbols.filter(s => !data[s]?.price && !data[s]?.notFound);
        if (failed.length > 0) {
          await new Promise(r => setTimeout(r, 5000)); // 5s — enough for Render to wake
          const retry = await fetchAllMetrics(failed);
          const merged = { ...data, ...retry };
          setMarketData(merged);
          localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: merged }));
        } else {
          localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
        }
      })
      .finally(() => setMetricsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  function enrichPosition(pos) {
    const fx = fxRates[pos.currency] ?? 1;
    const m  = marketData[pos.symbol] ?? {};

    const currentPrice = m.price ?? null;
    const notFound = m.notFound ?? false;
    const costPLN  = pos.qty * pos.avgPrice * fx;
    const valuePLN = currentPrice != null ? pos.qty * currentPrice * fx : null;
    const plPLN    = valuePLN != null ? valuePLN - costPLN : null;
    const moic     = currentPrice != null && pos.avgPrice > 0 ? currentPrice / pos.avgPrice : null;

    // Period: days since earliest BUY transaction (or holding date as fallback)
    const txs = transactions.filter(
      t => t.symbol === pos.symbol && (t.type === 'BUY' || t.type === 'SELL')
    );
    const firstDate = txs.length > 0
      ? txs.map(t => t.date).sort()[0]
      : pos.date;
    const periodDays = firstDate
      ? Math.max(0, Math.round((Date.now() - new Date(firstDate).getTime()) / 86400000))
      : null;

    // IRR via XIRR — only meaningful when holding period >= 30 days
    let irr = null;
    if (txs.length > 0 && currentPrice != null && periodDays != null && periodDays >= 30) {
      const flows = txs
        .filter(t => t.qty != null && t.price != null && t.qty > 0 && t.price > 0)
        .map(t => ({
          date:   t.date,
          amount: t.type === 'BUY'
            ? -(t.qty * t.price * (fxRates[t.currency] ?? 1))
            : +(t.qty * t.price * (fxRates[t.currency] ?? 1)),
        }));
      if (flows.length > 0) {
        flows.push({
          date:   new Date().toISOString().slice(0, 10),
          amount: +(pos.qty * currentPrice * fx),
        });
        const raw = calcXIRR(flows);
        irr = raw != null && Math.abs(raw) <= 10000 ? raw : null;
      }
    }

    const dow = new Date().getDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;
    const isCrypto  = m.sector === 'Cryptocurrency';

    return {
      ...pos,
      price:       m.price       ?? null,
      dailyChg:    (isWeekend && !isCrypto) ? null : (m.dailyChg ?? null),
      pe:          m.pe          ?? null,
      peFwd:       m.peFwd       ?? null,
      pb:          m.pb          ?? null,
      sector:      m.sector      ?? null,
      earningsTs:  m.earningsTs  ?? null,
      notFound,
      costPLN,
      valuePLN,
      plPLN,
      moic,
      periodDays,
      irr,
    };
  }

  return { enrichPosition, metricsLoading };
}
