// Wspólne formatery liczb, żeby ta sama wartość nie renderowała się
// dwoma stylami (np. kropka na /history, przecinek na /portfolio).

export function formatPercent(value, opts = {}) {
  const {
    locale = 'pl-PL',
    decimals = 2,
    showSign = true,
  } = opts;
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  const body = abs.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = value < 0 ? '-' : (showSign ? '+' : '');
  return `${sign}${body}%`;
}

// Data w tabelach i podpowiedziach: 05.03.2026 (pl) / 05/03/2026 (en) —
// zamiast surowego 2026-03-05 z bazy. Nieznany format zostaje bez zmian.
export function formatDate(iso, locale = 'pl-PL') {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}
