// Podpowiedzi przy wpisywaniu transakcji: waluta po symbolu i kurs
// zamknięcia z dnia transakcji (Yahoo przez /api/proxy, jak wykres spółki).

const CURRENCIES = new Set(['PLN', 'USD', 'EUR', 'GBP']);
const EUR_SUFFIX = /\.(DE|F|PA|AS|MI|MC|BR|VI|HE|LS|IR)$/;

// Waluta notowań po sufiksie giełdy Yahoo; null, gdy nie wiadomo.
export function currencyForSymbol(sym) {
  const s = String(sym ?? '').trim().toUpperCase();
  if (!s) return null;
  const crypto = s.match(/-(USD|EUR|PLN|GBP)$/);
  if (crypto) return crypto[1];
  if (s.endsWith('.WA')) return 'PLN';
  if (s.endsWith('.L')) return 'GBP';
  if (EUR_SUFFIX.test(s)) return 'EUR';
  return s.includes('.') ? null : 'USD';
}

// Zamknięcie z dnia `date` albo ostatniej sesji przed nim (weekend, święto).
// Londyn notuje w pensach (GBp) — przeliczamy na funty, bo w tej walucie
// aplikacja trzyma pozycje.
export function closeOnOrBefore(chart, date) {
  const result = chart?.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  let best = null;
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] == null) continue;
    const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    if (d <= date && (!best || d >= best.date)) best = { date: d, price: closes[i] };
  }
  if (!best) return null;
  const raw = result.meta?.currency;
  const pence = raw === 'GBp' || raw === 'GBX';
  const currency = pence ? 'GBP' : CURRENCIES.has(raw) ? raw : null;
  return { date: best.date, price: pence ? best.price / 100 : best.price, currency };
}

const cache = new Map();

export async function fetchPriceOnDate(symbol, date) {
  const key = `${symbol}|${date}`;
  if (cache.has(key)) return cache.get(key);
  const end = Math.floor(Date.parse(`${date}T23:59:59Z`) / 1000);
  // Tydzień wstecz wystarczy na weekend i święta.
  const start = end - 8 * 86400;
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${start}&period2=${end}`;
  const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const out = closeOnOrBefore(await res.json(), date);
  cache.set(key, out);
  return out;
}
