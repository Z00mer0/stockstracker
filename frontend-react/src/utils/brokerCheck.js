// Porównanie wyceny z aplikacji z wartością rachunku podaną przez biuro
// maklerskie (akcje + gotówka). Różnica ponad próg to sygnał, że czegoś
// brakuje: transakcji, dywidendy, opłaty, gotówki albo aktualnego kursu.
// Wszystkie kwoty w tej samej walucie.
export const BROKER_TOLERANCE_PCT = 0.5;   // ruch cen między wyceną biura a bieżącą

export function brokerCheck({ brokerValue, positionsValue = 0, cashValue = 0, tolerancePct = BROKER_TOLERANCE_PCT }) {
  if (!(brokerValue > 0)) return null;
  const app = positionsValue + cashValue;
  const diff = brokerValue - app;
  const pct = (diff / brokerValue) * 100;
  return { app, diff, pct, ok: Math.abs(pct) <= tolerancePct };
}

// Wykryte w aplikacji powody rozbieżności — do listy pod wynikiem.
export function brokerCheckIssues(positions = [], { partialPrices = false, fxStale = false } = {}) {
  const issues = [];
  const notFound = positions.filter(p => p.notFound).map(p => p.symbol);
  const stale = positions.filter(p => p.staleSince).map(p => p.symbol);
  if (notFound.length) issues.push({ key: 'notFound', symbols: notFound });
  if (stale.length) issues.push({ key: 'stale', symbols: stale });
  const mismatch = positions.filter(p => p.priceCheck?.mismatch).map(p => p.symbol);
  if (mismatch.length) issues.push({ key: 'priceMismatch', symbols: mismatch });
  if (partialPrices) issues.push({ key: 'partial' });
  if (fxStale) issues.push({ key: 'fx' });
  return issues;
}
