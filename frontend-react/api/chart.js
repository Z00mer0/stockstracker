import { rateLimited } from './_rateLimit.js';
// Vercel serverless — proxies Yahoo Finance chart data (no auth required)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (rateLimited(req, res)) return;

  const { symbol, interval, range } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  // Allowlista zamiast surowej interpolacji: symbol był kodowany, a te dwa
  // wchodziły do URL-a Yahoo bez żadnej obróbki, więc dało się dokleić własne
  // parametry zapytania. Host jest stały, więc to nie było SSRF, ale i tak nie
  // ma powodu przepuszczać czegokolwiek spoza zestawu, który Yahoo rozumie.
  const INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']);
  const RANGES    = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']);

  const iv  = INTERVALS.has(interval) ? interval : '1d';
  const rng = RANGES.has(range) ? range : '3mo';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${iv}&range=${rng}`;

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
    const data = await r.json();
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
