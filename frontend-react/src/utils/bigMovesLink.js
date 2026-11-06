// Lista ruchów z linku zbiorczego pusha: /moves?d=2026-11-06&m=TMDX:19.65,AMD:-7.20
// Zwraca { date, up: [{symbol, pct}], down: [...] } — od największego ruchu.
export function parseBigMoves(search) {
  const q = new URLSearchParams(search);
  const moves = (q.get('m') || '').split(',')
    .map(part => {
      const i = part.lastIndexOf(':');
      const symbol = part.slice(0, i).trim().toUpperCase();
      const pct = Number(part.slice(i + 1));
      return i > 0 && symbol && Number.isFinite(pct) ? { symbol, pct } : null;
    })
    .filter(Boolean);
  const byAbs = (a, b) => Math.abs(b.pct) - Math.abs(a.pct);
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(q.get('d') || '') ? q.get('d') : null,
    up: moves.filter(m => m.pct >= 0).sort(byAbs),
    down: moves.filter(m => m.pct < 0).sort(byAbs),
  };
}
