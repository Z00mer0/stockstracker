export default async function handler(req, res) {
  const symbols = (req.query.symbols || '')
    .split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
  if (!symbols.length) { res.status(200).json({}); return; }

  const result = {};
  await Promise.all(symbols.map(async (sym) => {
    try {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?events=splits&interval=1d&range=5y`;
      const resp = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return;
      const json = await resp.json();
      const raw = json?.chart?.result?.[0]?.events?.splits ?? {};
      const splits = Object.values(raw)
        .map(s => ({
          date:        new Date(s.date * 1000).toISOString().slice(0, 10),
          numerator:   s.numerator,
          denominator: s.denominator,
          ratio:       `${s.numerator}:${s.denominator}`,
        }))
        .sort((a, b) => b.date.localeCompare(a.date));
      if (splits.length) result[sym] = splits;
    } catch {}
  }));

  res.setHeader('Cache-Control', 's-maxage=3600');
  res.status(200).json(result);
}
