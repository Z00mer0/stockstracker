// Widok zbiorczy: „Wszystkie” albo grupa portfeli („group:<id>”) — tylko do
// odczytu, dane łączone z kilku portfeli (/api/portfolios/all/data[?ids=]).
export const isAggregateView = id => id === 'all' || String(id ?? '').startsWith('group:');
export const groupIdOf = id => (String(id ?? '').startsWith('group:') ? String(id).slice(6) : null);

export function dataUrlFor(id, groups = []) {
  if (id === 'all') return '/api/portfolios/all/data';
  const gid = groupIdOf(id);
  if (gid) {
    const g = groups.find(x => x.id === gid);
    return `/api/portfolios/all/data?ids=${(g?.portfolioIds ?? []).join(',')}`;
  }
  return `/api/portfolios/${id}/data`;
}
