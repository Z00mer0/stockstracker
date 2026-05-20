const CACHE_PREFIX = 'st_div_cache_';
const CACHE_TTL = 24 * 60 * 60 * 1000;

export const US_TAX_KEY = 'myfund_us_div_tax';
export const DIV_MODE_KEY = 'myfund_div_net_mode';

export function getUsTaxRate() {
  return localStorage.getItem(US_TAX_KEY) === '30' ? 0.30 : 0.15;
}

export function getTaxRate(symbol, currency) {
  if (symbol?.includes('.WA') || currency === 'PLN') return 0.19;
  return getUsTaxRate();
}

export async function fetchDividendHistory(symbol) {
  const cacheKey = CACHE_PREFIX + symbol;
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (c?.ts && Date.now() - c.ts < CACHE_TTL) return c.data;
  } catch {}
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&events=div`;
    const r = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000), headers: { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const evts = json?.chart?.result?.[0]?.events?.dividends ?? {};
    const data = Object.values(evts)
      .map(d => ({ date: new Date(d.date * 1000).toISOString().slice(0, 10), amount: d.amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    return data;
  } catch {
    return [];
  }
}

export function calcAnnualDivPerShare(history) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutStr = cutoff.toISOString().slice(0, 10);
  return history.filter(d => d.date >= cutStr).reduce((s, d) => s + d.amount, 0);
}

export function calcYoC(annualDivPerShare, avgPrice) {
  if (!avgPrice || !annualDivPerShare) return null;
  return (annualDivPerShare / avgPrice) * 100;
}
