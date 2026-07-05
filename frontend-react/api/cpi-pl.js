// Vercel serverless function — Polish CPI (HICP) monthly index from Eurostat.
// Returns { date: 'YYYY-MM-01', price: index_value (2015=100) } sorted oldest-first.
// Extends to current month using YoY estimates when Eurostat has a lag.

// Estimated YoY rates (%) for months not yet published by Eurostat.
// Updated as GUS/NBP data becomes available — extend this table each quarter.
const YOY_ESTIMATES = {
  '2025-09': 3.9, '2025-10': 3.8, '2025-11': 3.7, '2025-12': 3.8,
  '2026-01': 4.9, '2026-02': 4.6, '2026-03': 4.2, '2026-04': 3.9,
  '2026-05': 3.7, '2026-06': 3.5, '2026-07': 3.4, '2026-08': 3.3,
  '2026-09': 3.3, '2026-10': 3.2, '2026-11': 3.1, '2026-12': 3.0,
};

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const EUROSTAT_URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_midx?geo=PL&coicop=CP00&format=JSON';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

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

    // Extend to current month + 2 using YoY estimates for months with lag
    const today = new Date();
    const extendTo = new Date(today.getFullYear(), today.getMonth() + 2, 1);

    const lastEurostatMonth = Object.keys(indexMap).sort().pop(); // e.g. '2025-12'
    const cursor = new Date(`${lastEurostatMonth}-02`); // start from day after last month

    while (cursor < extendTo) {
      cursor.setMonth(cursor.getMonth() + 1);
      const key = cursor.toISOString().slice(0, 7); // 'YYYY-MM'
      if (indexMap[key] != null) continue; // already have from Eurostat

      const prevYear = cursor.getFullYear() - 1;
      const month    = String(cursor.getMonth() + 1).padStart(2, '0');
      const prevKey  = `${prevYear}-${month}`;
      const prevVal  = indexMap[prevKey];
      if (prevVal == null) continue; // can't compute without previous year

      const yoy = (YOY_ESTIMATES[key] ?? 3.5) / 100;
      indexMap[key] = +(prevVal * (1 + yoy)).toFixed(1);
    }

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
