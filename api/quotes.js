import { rateLimited } from './_rateLimit.js';
import { fetchStooq, isFundSymbol, isStooqDirect } from './_stooq.js';
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
  // GPW: stooq równolegle — kontrola kursu z Yahoo albo zapas, gdy Yahoo padnie.
  const stooqP = fetchStooq(sym, { headers: { 'User-Agent': UA } });
  // Fundusze TFI i kontrakty terminowe: Yahoo ich nie zna — kurs tylko ze stooq.
  if (isFundSymbol(sym) || isStooqDirect(sym)) {
    const f = await stooqP;
    return f ? { stooq: true, price: f.price, date: f.date, time: f.time } : { notFound: true, error: 'fund not found' };
  }
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
        // Kiedy była ostatnia transakcja i w jakiej strefie notuje giełda —
        // bez tego w sobotę „zmiana dziś" to wciąż zmiana z piątku.
        regularMarketTime: meta.regularMarketTime ?? null,
        exchangeTimezoneName: meta.exchangeTimezoneName ?? null,
        // Do podsumowania sesji (obrót = cena × wolumen, nazwa spółki).
        regularMarketVolume: meta.regularMarketVolume ?? null,
        shortName: meta.shortName ?? meta.longName ?? null,
        // Waluta notowania (Londyn: GBp = pensy) — klient sprawdza z walutą pozycji.
        currency: meta.currency ?? null,
        // Kurs z drugiego źródła (GPW) — klient porównuje i ostrzega przy rozjeździe.
        priceCheck: await stooqP,
      },
    };
  } catch (e1) {
    // Zapas: stooq (GPW — już pobrany równolegle, reszta jak dotąd).
    try {
      const gpw = await stooqP;
      if (gpw) return { stooq: true, price: gpw.price, date: gpw.date, time: gpw.time };
      if (!sym.endsWith('.WA')) {
        const url = `https://stooq.com/q/l/?s=${sym.toLowerCase()}.us&f=sd2ohlcv&h&e=csv`;
        const r = await fetch(url, {
          headers: { 'User-Agent': UA, 'Referer': 'https://stooq.com/' },
          signal: AbortSignal.timeout(6000),
        });
        const lines = (await r.text()).trim().split('\n');
        if (lines.length >= 2) {
          const price = parseFloat(lines[1].split(',')[5]);
          if (price > 0) return { stooq: true, price };
        }
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
