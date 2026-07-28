import { rateLimited } from './_rateLimit.js';
// Vercel serverless function — fetches stock quotes server-side (different IP than Render)
// No auth required — stock prices are public data
//
// Dwa kształty odpowiedzi:
//   ?symbols=AAPL              → { quoteResponse: { result: [ ... ] } }  (jak zawsze)
//   ?symbols=AAPL,MSFT&format=map → { quotes: { AAPL: {...}, MSFT: {...} } }
// Stary kształt zostaje nietknięty, bo woła go też server.py (`_quote_via_vercel`).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_SYMBOLS = 60;

// Zwraca { quote } | { stooq } | { notFound: true } | null (błąd przejściowy)
async function fetchOne(sym) {
  let yahooStatus = null;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    yahooStatus = r.status;
    if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) throw new Error('no price in chart');
    const prev = meta.chartPreviousClose;
    const price = meta.regularMarketPrice;
    return {
      quote: {
        regularMarketPrice: price,
        regularMarketChangePercent: prev > 0 ? ((price - prev) / prev) * 100 : null,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      },
    };
  } catch (e1) {
    // Stooq CSV fallback (Polish .WA stocks)
    try {
      const stooqSym = sym.endsWith('.WA') ? sym.slice(0, -3).toLowerCase() : sym.toLowerCase() + '.us';
      const url = `https://stooq.com/q/l/?s=${stooqSym}&f=sd2ohlcv&h&e=csv`;
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Referer': 'https://stooq.com/' },
        signal: AbortSignal.timeout(6000),
      });
      const text = await r.text();
      const lines = text.trim().split('\n');
      if (lines.length >= 2) {
        const price = parseFloat(lines[1].split(',')[5]);
        if (price > 0) return { stooq: true, price };
      }
    } catch {}
    // Yahoo powiedziało 404 → symbol nie istnieje, nie ma po co ponawiać
    return yahooStatus === 404 ? { notFound: true, error: e1.message } : null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (rateLimited(req, res)) return;

  const { symbols, format } = req.query;
  if (!symbols || symbols.length > 1000) {
    return res.status(400).json({ error: 'symbols required' });
  }

  const list = String(symbols).split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_SYMBOLS);
  if (list.length === 0) return res.status(400).json({ error: 'symbols required' });

  if (format !== 'map') {
    // Ścieżka zgodności: jeden symbol, odpowiedź dokładnie jak wcześniej.
    const sym = list[0];
    const out = await fetchOne(sym);
    if (out?.quote)  return res.status(200).json({ quoteResponse: { result: [out.quote] } });
    if (out?.stooq)  return res.status(200).json({ stooq: true, symbol: sym, price: out.price });
    if (out?.notFound) return res.status(404).json({ error: out.error });
    return res.status(502).json({ error: 'upstream failed' });
  }

  // Wszystkie symbole równolegle — to jest cały sens tego endpointu.
  const settled = await Promise.allSettled(list.map(fetchOne));
  const quotes = {};
  list.forEach((sym, i) => {
    const r = settled[i];
    quotes[sym] = r.status === 'fulfilled' ? r.value : null;
  });
  return res.status(200).json({ quotes });
}
