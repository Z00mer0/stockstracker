// Wspólny wygląd wykresów recharts (faza 4 redesignu). Kolory to zmienne
// CSS motywu, więc wykres sam przełącza się z motywem — bez nasłuchiwania
// zmiany i ponownego rysowania, jak było przy chart.js.

export const axisProps = {
  tick: { fontSize: 11, fill: 'var(--text-faint)' },
  tickLine: false,
  axisLine: false,
};

export const gridProps = {
  stroke: 'var(--border)',
  strokeDasharray: '3 3',
  vertical: false,
};

export const tooltipProps = {
  contentStyle: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
    boxShadow: 'var(--shadow-pop, 0 8px 24px rgba(0,0,0,.25))',
  },
  labelStyle: { color: 'var(--text-dim)', marginBottom: 4 },
  itemStyle: { color: 'var(--text)', padding: 0 },
  cursor: { stroke: 'var(--border-strong, var(--border))', strokeDasharray: '3 3' },
};

export const legendProps = {
  iconType: 'plainline',
  wrapperStyle: { fontSize: 12, color: 'var(--text-dim)' },
};
