import { rateLimited } from './_rateLimit.js';
// Vercel serverless function — Polish CPI (HICP) monthly index from Eurostat.
// Returns { date: 'YYYY-MM-01', price: index_value (2015=100) } sorted oldest-first.
// Only published months — no estimates for the months Eurostat hasn't released yet.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const EUROSTAT_URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_midx?geo=PL&coicop=CP00&format=JSON';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (rateLimited(req, res)) return;

  try {
    const r = await fetch(EUROSTAT_URL, {
      headers: { 'Accept': 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Eurostat HTTP ${r.status}`);

    const body = await r.json();
    const timeIndex = body?.dimension?.time?.category?.index ?? {};
    const values    = body?.value ?? {};

    // Build index map { 'YYYY-MM': price }
    const indexMap = {};
    for (const [period, pos] of Object.entries(timeIndex)) {
      const v = values[String(pos)];
      if (v != null) indexMap[period] = v;
    }

    if (!Object.keys(indexMap).length) throw new Error('Empty Eurostat response');

    const pts = Object.entries(indexMap)
      .map(([period, price]) => ({ date: `${period}-01`, price }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
    return res.status(200).json(pts);
  } catch (e) {
    console.error('cpi-pl error:', e.message);
    return res.status(502).json({ error: e.message });
  }
}
