// frontend-react/src/hooks/usePortfolioMetrics.js
import { useState, useEffect } from 'react';

const FINNHUB_TOKEN = 'd7uhj69r01qnv95nm3e0d7uhj69r01qnv95nm3eg';
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

// ── Finnhub fetch ────────────────────────────────────────────────────────────
async function fetchAllMetrics(symbols) {
  const results = {};
  await Promise.allSettled(
    symbols.map(async (sym) => {
      try {
        const [qRes, mRes] = await Promise.allSettled([
          fetch(
            `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_TOKEN}`,
            { signal: AbortSignal.timeout(8000) }
          ).then(r => r.json()),
          fetch(
            `https://finnhub.io/api/v1/stock/metric?symbol=${sym}&metric=all&token=${FINNHUB_TOKEN}`,
            { signal: AbortSignal.timeout(8000) }
          ).then(r => r.json()),
        ]);
        const q = qRes.status === 'fulfilled' ? qRes.value : null;
        const m = mRes.status === 'fulfilled' ? mRes.value?.metric : null;
        results[sym] = {
          price:    q?.c  ?? null,
          dailyChg: q?.dp ?? null,
          pe:       m?.peBasicExclExtraTTM ?? null,
          peFwd:    m?.peForwardDiluted    ?? null,
          pb:       m?.pbAnnual            ?? null,
        };
      } catch {
        results[sym] = { price: null, dailyChg: null, pe: null, peFwd: null, pb: null };
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
      .then(data => {
        setMarketData(data);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
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
