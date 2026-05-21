// frontend-react/src/hooks/usePortfolioMetrics.js
import { useState, useEffect } from 'react';

function authHeader() {
  return { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' };
}

const CACHE_KEY = 'portfolio_metrics_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// ── XIRR ────────────────────────────────────────────────────────────────────
// cashFlows: [{ date: 'YYYY-MM-DD', amount: number }]
// Returns annualised rate as percentage (e.g. 12.0 = 12%), or null if can't converge
function calcXIRR(cashFlows) {
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
  return isFinite(r) && r > -0.99 ? r * 100 : null;
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
async function fetchYahooQuote(sym) {
  // Primary: Vercel /api/quotes (different IP from Render, avoids blocks)
  try {
    const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(sym)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // Stooq fallback response from Vercel function
    if (json.stooq) return { price: json.price, dailyChg: null, pe: null, peFwd: null, pb: null };
    const q = json?.quoteResponse?.result?.[0];
    if (!q?.regularMarketPrice) throw new Error('no price');
    return {
      price:      q.regularMarketPrice,
      dailyChg:   q.regularMarketChangePercent ?? null,
      pe:         q.trailingPE  ?? null,
      peFwd:      q.forwardPE   ?? null,
      pb:         q.priceToBook ?? null,
      sector:     q.sector      ?? null,
      earningsTs: q.earningsTimestamp ?? q.earningsTimestampStart ?? null,
    };
  } catch {
    // Fallback: Render proxy (if Vercel function fails)
    const price = await fetchStooqPrice(sym);
    return price ? { price, dailyChg: null, pe: null, peFwd: null, pb: null } : null;
  }
}

// ── Hardcoded sectors for GPW (.WA) — Yahoo Finance v7 returns 401 for PL tickers ──
const WA_SECTOR_MAP = {
  'XTB.WA':  'Financial Services',
  'PKN.WA':  'Energy',
  'ALE.WA':  'Energy',
  'CDR.WA':  'Technology',
  'PKO.WA':  'Financial Services',
  'PEO.WA':  'Financial Services',
  'PZU.WA':  'Financial Services',
  'LPP.WA':  'Consumer Cyclical',
  'DNP.WA':  'Healthcare',
  'KGH.WA':  'Basic Materials',
  'JSW.WA':  'Basic Materials',
  'CPS.WA':  'Technology',
  'MDV.WA':  'Real Estate',
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
async function fetchAllMetrics(symbols) {
  const results = {};
  await Promise.allSettled(
    symbols.map(async (sym) => {
      try {
        let price = null, dailyChg = null, pe = null, peFwd = null, pb = null, sector = null, earningsTs = null;

        if (sym.includes('.')) {
          // Non-US exchange (GPW .WA, LSE .L, etc.) — Yahoo Finance for price/fundamentals
          const yq = await fetchYahooQuote(sym);
          if (yq) { price = yq.price; dailyChg = yq.dailyChg; pe = yq.pe; peFwd = yq.peFwd; pb = yq.pb; sector = yq.sector; earningsTs = yq.earningsTs; }
          // .WA: Yahoo returns 401 for sector — use hardcoded sector map
          // Finnhub earnings calendar returns 403 for .WA on free tier, so skip it
          if (sym.endsWith('.WA')) {
            sector = sector ?? WA_SECTOR_MAP[sym] ?? null;
          }
        } else {
          // US stocks — Finnhub primary, Yahoo fallback for price + fundamentals
          const [qRes, mRes] = await Promise.allSettled([
            fetch(`/api/finnhub/v1/quote?symbol=${sym}`, { signal: AbortSignal.timeout(8000), headers: authHeader() }).then(r => r.json()),
            fetch(`/api/finnhub/v1/stock/metric?symbol=${sym}&metric=all`, { signal: AbortSignal.timeout(8000), headers: authHeader() }).then(r => r.json()),
          ]);
          const q = qRes.status === 'fulfilled' ? qRes.value : null;
          const m = mRes.status === 'fulfilled' ? mRes.value?.metric : null;
          price    = (q?.c  > 0) ? q.c  : null;
          dailyChg = (q?.dp != null && q.c > 0) ? q.dp : null;
          pe    = m?.peBasicExclExtraTTM ?? null;
          peFwd = m?.peForwardDiluted   ?? null;
          pb    = m?.pbAnnual            ?? null;
          if (price == null || pe == null || sector == null) {
            const yq = await fetchYahooQuote(sym);
            if (yq) {
              price      = price      ?? yq.price;
              dailyChg   = dailyChg   ?? yq.dailyChg;
              pe         = pe         ?? yq.pe;
              peFwd      = peFwd      ?? yq.peFwd;
              pb         = pb         ?? yq.pb;
              sector     = sector     ?? yq.sector;
              earningsTs = earningsTs ?? yq.earningsTs;
            }
          }
        }

        results[sym] = { price, dailyChg, pe, peFwd, pb, sector, earningsTs };
      } catch {
        results[sym] = { price: null, dailyChg: null, pe: null, peFwd: null, pb: null, sector: null, earningsTs: null };
      }
    })
  );
  return results;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function usePortfolioMetrics(portfolio, transactions, fxRates) {
  const [marketData, setMarketData] = useState({});
  const [metricsLoading, setMetricsLoading] = useState(false);

  const symbolsKey = portfolio.map(p => p.symbol).sort().join(',');

  useEffect(() => {
    if (!portfolio.length) return;

    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached?.ts && Date.now() - cached.ts < CACHE_TTL) {
        setMarketData(cached.data);
        return;
      }
    } catch {}

    const symbols = [...new Set(portfolio.map(p => p.symbol))];
    setMetricsLoading(true);
    fetchAllMetrics(symbols)
      .then(async data => {
        setMarketData(data);
        // Retry symbols that failed (e.g. Render was waking up)
        const failed = symbols.filter(s => !data[s]?.price);
        if (failed.length > 0) {
          await new Promise(r => setTimeout(r, 15000));
          const retry = await fetchAllMetrics(failed);
          const merged = { ...data, ...retry };
          setMarketData(merged);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: merged }));
        } else {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        }
      })
      .finally(() => setMetricsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  function enrichPosition(pos) {
    const fx = fxRates[pos.currency] ?? 1;
    const m  = marketData[pos.symbol] ?? {};

    const currentPrice = m.price ?? null;
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

    // IRR via XIRR
    let irr = null;
    if (txs.length > 0 && currentPrice != null) {
      const flows = txs.map(t => ({
        date:   t.date,
        amount: t.type === 'BUY'
          ? -(t.qty * t.price * (fxRates[t.currency] ?? 1))
          : +(t.qty * t.price * (fxRates[t.currency] ?? 1)),
      }));
      flows.push({
        date:   new Date().toISOString().slice(0, 10),
        amount: +(pos.qty * currentPrice * fx),
      });
      irr = calcXIRR(flows);
    }

    return {
      ...pos,
      price:       m.price       ?? null,
      dailyChg:    m.dailyChg    ?? null,
      pe:          m.pe          ?? null,
      peFwd:       m.peFwd       ?? null,
      pb:          m.pb          ?? null,
      sector:      m.sector      ?? null,
      earningsTs:  m.earningsTs  ?? null,
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
