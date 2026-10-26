import { lsSet } from '../utils/safeStorage.js';
const CACHE_PREFIX = 'st_div_cache_';
const CACHE_TTL = 24 * 60 * 60 * 1000;

export const US_TAX_KEY = 'myfund_us_div_tax';
export const DIV_MODE_KEY = 'myfund_div_net_mode';

export function getUsTaxRate() {
  return localStorage.getItem(US_TAX_KEY) === '30' ? 0.30 : 0.15;
}

// Podatek u źródła od dywidendy dla inwestora z Polski, wg giełdy spółki
// (sufiks Yahoo). Stawki ustawowe, które broker zwykle pobiera bez
// dodatkowych formularzy; tam, gdzie da się odzyskać nadwyżkę z umowy
// o unikaniu podwójnego opodatkowania, trzeba to zrobić samemu. Spółki z USA
// (bez sufiksu) — wg odpowiedzi o W-8BEN. Nieznany rynek — typowe 15%.
// Faktycznie pobrany podatek wpisany przy dywidendzie zawsze wygrywa.
const WHT_BY_SUFFIX = {
  L: 0, HK: 0,                      // Wielka Brytania, Hongkong
  DE: 0.26375, F: 0.26375,          // Niemcy (z dopłatą solidarnościową)
  PA: 0.128,                        // Francja (osoby fizyczne)
  AS: 0.15,                         // Holandia
  BR: 0.30,                         // Belgia
  MI: 0.26,                         // Włochy
  MC: 0.19,                         // Hiszpania
  VI: 0.275,                        // Austria
  SW: 0.35,                         // Szwajcaria
  ST: 0.30, CO: 0.27, OL: 0.25, HE: 0.35,   // Szwecja, Dania, Norwegia, Finlandia
  IR: 0.25,                         // Irlandia
  TO: 0.25,                         // Kanada
  T: 0.15315,                       // Japonia
};

export function withholdingRate(symbol, currency) {
  const m = String(symbol ?? '').toUpperCase().match(/\.([A-Z]+)$/);
  if (!m) return currency && currency !== 'USD' ? 0.15 : getUsTaxRate();
  return WHT_BY_SUFFIX[m[1]] ?? 0.15;
}

export function getTaxRate(symbol, currency, accountType) {
  if (symbol?.includes('.WA') || currency === 'PLN') {
    // IKE/IKZE: dywidendy z GPW bez podatku Belki; zagraniczny WHT u źródła obowiązuje nadal
    return accountType === 'IKE' || accountType === 'IKZE' ? 0 : 0.19;
  }
  // Zagranica: podatek u źródła wg kraju spółki. Na zwykłym rachunku do 19%
  // dopłaca się w Polsce, więc łącznie nigdy mniej niż 19%. Na IKE/IKZE
  // zostaje tylko potrącenie u źródła.
  const wht = withholdingRate(symbol, currency);
  return accountType === 'IKE' || accountType === 'IKZE' ? wht : Math.max(wht, 0.19);
}

// Stawka dla zapisanej dywidendy: podatek faktycznie pobrany (tx.tax)
// wygrywa z szacunkiem. Za granicą na zwykłym rachunku do 19% dopłaca się
// w Polsce, więc niższy podatek u źródła nie obniża stawki poniżej 19%.
export function dividendTaxRate(tx, accountType) {
  const gross = (tx.price || 0) * (tx.qty || 1);
  if (tx.tax == null || tx.tax === '' || !(gross > 0)) return getTaxRate(tx.symbol, tx.currency, accountType);
  const withheld = Math.min(1, Math.max(0, Number(tx.tax) / gross));
  const foreign = !(tx.symbol?.includes('.WA') || tx.currency === 'PLN');
  const taxFree = accountType === 'IKE' || accountType === 'IKZE';
  return foreign && !taxFree ? Math.max(withheld, 0.19) : withheld;
}

export async function fetchDividendHistory(symbol) {
  const cacheKey = CACHE_PREFIX + symbol;
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (c?.ts && Date.now() - c.ts < CACHE_TTL) return c.data;
  } catch {}
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&events=div`;
    const r = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000), });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const evts = json?.chart?.result?.[0]?.events?.dividends ?? {};
    const data = Object.values(evts)
      .map(d => ({ date: new Date(d.date * 1000).toISOString().slice(0, 10), amount: d.amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
    lsSet(cacheKey, JSON.stringify({ ts: Date.now(), data }));
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
