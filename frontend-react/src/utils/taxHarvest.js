// Sprzedaż pozycji ze stratą przed końcem roku, żeby obniżyć podatek od
// zysku zrealizowanego w tym roku. Oszczędność liczona przez PIT-38 razem ze
// stratami z lat poprzednich (lossCarryForward): gdy zysk i tak pokrywają
// stare straty, nowa strata daje mniej, niż wynikałoby z 19% od niej.
import { lossCarryForward, settlementDate } from './pit38.js';
import { isTradingDay, marketOf } from './marketCalendar.js';

// incomes: { rok: dochód z PIT-38 }, losers: [{ symbol, lossPLN }] od największej.
// Zwraca podatek przed i po, odliczenie strat z lat poprzednich i dla każdej
// pozycji oszczędność, gdy sprzeda się ją razem z poprzednimi z listy.
export function harvestPlan(incomes, year, losers) {
  const before = lossCarryForward(incomes, year);
  const income = incomes[year] ?? 0;
  let harvested = 0;
  let prevTax = before.tax;
  const rows = losers.map(l => {
    harvested += l.lossPLN;
    const after = lossCarryForward({ ...incomes, [year]: income - harvested }, year);
    const savingPLN = prevTax - after.tax;
    prevTax = after.tax;
    return { ...l, savingPLN };
  });
  return {
    taxBefore: before.tax,
    taxAfter: prevTax,
    carryDeduction: before.deduction,
    // Strata ponad zysk nie przepada — przechodzi na kolejne lata.
    carriedToNextYears: Math.max(0, harvested - Math.max(0, income - before.deduction)),
    rows,
  };
}

// Ostatni dzień sesji, w którym sprzedaż liczy się jeszcze do tego roku:
// przy dacie rozliczenia (domyślnie) GPW T+2, USA T+1 — rozliczenie musi
// przypaść najpóźniej 31 grudnia. Przy dacie zawarcia — ostatnia sesja roku.
export function lastSellDate(symbol, currency, year, basis = 'settlement') {
  const market = marketOf(symbol, currency || 'PLN');
  const end = `${year}-12-31`;
  const d = new Date(`${end}T12:00:00Z`);
  for (let i = 0; i < 20; i++, d.setUTCDate(d.getUTCDate() - 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (!isTradingDay(iso, market)) continue;
    if (basis === 'trade' || settlementDate({ date: iso, symbol, currency }) <= end) return iso;
  }
  return null;
}
