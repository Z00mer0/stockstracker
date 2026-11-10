// src/components/shared/Chip.jsx
import { useLanguage } from '../../context/LanguageContext';

export default function Chip({ value, suffix = '%', decimals = 2 }) {
  const { locale } = useLanguage();
  if (value == null || isNaN(value)) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  const up = value >= 0;
  const arrow = up ? '▲' : '▼';
  const cls = up ? 'chip chip-up' : 'chip chip-down';
  // Format lokalny (przecinek po polsku) — toFixed dawał „3.90%” obok „3,12%”.
  return (
    <span className={cls}>
      {arrow} {Math.abs(value).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}
