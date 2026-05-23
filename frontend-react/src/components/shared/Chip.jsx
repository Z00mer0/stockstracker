// src/components/shared/Chip.jsx
export default function Chip({ value, suffix = '%', decimals = 2 }) {
  if (value == null || isNaN(value)) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  const up = value >= 0;
  const arrow = up ? '▲' : '▼';
  const cls = up ? 'chip chip-up' : 'chip chip-down';
  return (
    <span className={cls}>
      {arrow} {Math.abs(value).toFixed(decimals)}{suffix}
    </span>
  );
}
