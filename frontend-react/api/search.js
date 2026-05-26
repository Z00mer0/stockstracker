// Vercel serverless — proxy Yahoo Finance symbol search to avoid CORS
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { q } = req.query;
  if (!q || q.length < 1) return res.status(400).json({ error: 'q required' });

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=7&newsCount=0&enableNavLinks=false`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
    const data = await r.json();
    const results = (data.quotes ?? [])
      .filter(q => q.symbol && q.quoteType !== 'CURRENCY')
      .slice(0, 6)
      .map(q => ({ symbol: q.symbol, name: q.shortname || q.longname || '', exchange: q.exchDisp || '' }));
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ results });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
