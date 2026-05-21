// Vercel serverless function — fetches stock quotes server-side (different IP than Render)
// No auth required — stock prices are public data

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { symbols } = req.query;
  if (!symbols || symbols.length > 500) {
    return res.status(400).json({ error: 'symbols required' });
  }

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  const sym = symbols.trim();

  // Try Yahoo Finance v8 chart (no auth required)
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
    const r = await fetch(url, {
      headers: { 'User-Agent': ua, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) throw new Error('no price in chart');
    const prev = meta.chartPreviousClose;
    const price = meta.regularMarketPrice;
    const changePercent = prev > 0 ? ((price - prev) / prev) * 100 : null;
    return res.status(200).json({
      quoteResponse: {
        result: [{ regularMarketPrice: price, regularMarketChangePercent: changePercent }],
      },
    });
  } catch (e1) {
    // Stooq CSV fallback (Polish .WA stocks)
    try {
      const stooqSym = sym.endsWith('.WA') ? sym.slice(0, -3).toLowerCase() : sym.toLowerCase() + '.us';
      const url = `https://stooq.com/q/l/?s=${stooqSym}&f=sd2ohlcv&h&e=csv`;
      const r = await fetch(url, {
        headers: { 'User-Agent': ua, 'Referer': 'https://stooq.com/' },
        signal: AbortSignal.timeout(6000),
      });
      const text = await r.text();
      const lines = text.trim().split('\n');
      if (lines.length >= 2) {
        const cols = lines[1].split(',');
        const price = parseFloat(cols[5]);
        if (price > 0) return res.status(200).json({ stooq: true, symbol: sym, price });
      }
    } catch {}
    return res.status(502).json({ error: e1.message });
  }
}
