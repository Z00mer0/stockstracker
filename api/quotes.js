// Vercel serverless function — fetches stock quotes server-side (different IP than Render)
// No auth required — stock prices are public data

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { symbols } = req.query;
  if (!symbols || symbols.length > 500) {
    return res.status(400).json({ error: 'symbols required' });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // Try Yahoo Finance v7
  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent,trailingPE,forwardPE,priceToBook,sector,earningsTimestamp`;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e1) {
    // Try Stooq CSV fallback (price only, single symbol)
    const symList = symbols.split(',');
    if (symList.length === 1) {
      try {
        const sym = symList[0].trim();
        const stooqSym = sym.endsWith('.WA') ? sym.slice(0, -3).toLowerCase()
          : sym.toLowerCase() + '.us';
        const url = `https://stooq.com/q/l/?s=${stooqSym}&f=sd2ohlcv&h&e=csv`;
        const r = await fetch(url, { headers: { ...headers, 'Referer': 'https://stooq.com/' }, signal: AbortSignal.timeout(6000) });
        const text = await r.text();
        const lines = text.trim().split('\n');
        if (lines.length >= 2) {
          const cols = lines[1].split(',');
          const price = parseFloat(cols[5]);
          if (price > 0) {
            return res.status(200).json({ stooq: true, symbol: sym, price });
          }
        }
      } catch {}
    }
    return res.status(502).json({ error: e1.message });
  }
}
