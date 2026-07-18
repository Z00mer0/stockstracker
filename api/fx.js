// Vercel serverless — proxies frankfurter.app to avoid browser CORS restrictions
// Cached 30 min on CDN edge

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=300');

  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=PLN,EUR,GBP', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Frankfurter HTTP ${r.status}`);
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
