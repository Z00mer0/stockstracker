// Vercel serverless function — fetches Polish index historical data from Stooq
// Used by History.jsx benchmark comparison (WIG, WIG20)

const ALLOWED = { WIG: 'wig', WIG20: 'wig20', WIG30: 'wig30' };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const sym = (req.query.s || '').toUpperCase();
  const stooqSym = ALLOWED[sym];
  if (!stooqSym) {
    return res.status(400).json({ error: `Unknown symbol: ${sym}. Allowed: ${Object.keys(ALLOWED).join(', ')}` });
  }

  const url = `https://stooq.com/q/d/l/?s=${stooqSym}&i=d`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Referer': 'https://stooq.com/' },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`Stooq HTTP ${r.status}`);
    const text = await r.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error('empty response');

    // CSV: Date,Open,High,Low,Close,Volume  (newest first)
    const pts = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 5) continue;
      const date = cols[0].trim();
      const close = parseFloat(cols[4]);
      if (date && !isNaN(close)) pts.push({ date, price: close });
    }
    // Return oldest-first for chart rendering
    pts.reverse();

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json(pts);
  } catch (e) {
    console.error('bench-pl error:', e.message);
    return res.status(502).json({ error: e.message });
  }
}
