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
