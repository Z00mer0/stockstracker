// Historia dywidend spółki z 10 lat: suma na akcję w każdym pełnym roku,
// ile lat z rzędu płaci i jak szybko dywidenda rosła (średniorocznie, do 5 lat).
// history: [{ date: 'YYYY-MM-DD', amount }] — z fetchDividendHistory.
export function dividendTrack(history = [], today = new Date().toISOString().slice(0, 10)) {
  const thisYear = Number(today.slice(0, 4));
  // Zakres 10 lat liczony od dziś: rok sprzed 10 lat i bieżący są niepełne.
  const firstFull = thisYear - 9, lastFull = thisYear - 1;
  const byYear = new Map();
  for (const d of history) {
    const y = Number(String(d.date).slice(0, 4));
    if (y >= firstFull && y <= lastFull && d.amount > 0) byYear.set(y, (byYear.get(y) ?? 0) + d.amount);
  }
  const years = [];
  for (let y = firstFull; y <= lastFull; y++) years.push({ year: y, perShare: byYear.get(y) ?? 0 });

  let streak = 0;
  for (let i = years.length - 1; i >= 0 && years[i].perShare > 0; i--) streak++;

  let growth = null;
  const span = Math.min(5, streak - 1);
  if (span >= 2) {
    const last = years[years.length - 1].perShare, first = years[years.length - 1 - span].perShare;
    growth = { pct: (Math.pow(last / first, 1 / span) - 1) * 100, years: span };
  }
  return { years, streak, growth };
}
