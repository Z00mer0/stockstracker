// Polskie formatowanie domyślnie nie rozdziela liczb czterocyfrowych
// („4800,00 zł” obok „20 000,00 zł”). W tabelach kwot wygląda to jak błąd,
// więc w całej aplikacji grupujemy zawsze — chyba że wywołanie samo ustawi
// useGrouping.
const original = Number.prototype.toLocaleString;

Number.prototype.toLocaleString = function toLocaleString(locales, options) {
  return original.call(this, locales, options?.useGrouping === undefined ? { ...options, useGrouping: 'always' } : options);
};
