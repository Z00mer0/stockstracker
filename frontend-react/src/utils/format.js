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

// Liczba ze stałą liczbą miejsc po przecinku w formacie lokalnym — zamiast
// toFixed, które zawsze daje kropkę („3.90%” obok „3,12%”).
// Bez `locale` (funkcje poza komponentami) — język zapisany przez LanguageProvider.
function storedLocale() {
  try { return localStorage.getItem('myfund_language') === 'en' ? 'en-US' : 'pl-PL'; } catch { return 'pl-PL'; }
}

export function formatNumber(value, decimals = 2, locale = storedLocale()) {
  return Number(value).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Duże kwoty w skrócie: 78,00 mld / 31,00 mln (pl), 78.00B / 31.00M (en).
export function formatLarge(val, decimals = 2, locale = storedLocale()) {
  if (val == null || isNaN(val)) return '—';
  const pl = !String(locale).startsWith('en');
  const abs = Math.abs(val);
  const unit = (n, plSuffix, enSuffix) => formatNumber(n, decimals, locale) + (pl ? ` ${plSuffix}` : enSuffix);
  if (abs >= 1e12) return unit(val / 1e12, 'bln', 'T');
  if (abs >= 1e9)  return unit(val / 1e9, 'mld', 'B');
  if (abs >= 1e6)  return unit(val / 1e6, 'mln', 'M');
  return Number(val).toLocaleString(locale, { maximumFractionDigits: 0 });
}
