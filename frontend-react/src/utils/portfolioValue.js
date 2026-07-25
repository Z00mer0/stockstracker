// Wartość portfela liczona w jednym miejscu.
//
// Ta logika istniała w dwóch kopiach — w Dashboard.jsx i Portfolio.jsx — i to
// się zemściło: ta sama poprawka musiała wejść dwoma osobnymi PR-ami, bo
// naprawa jednej kopii nie ruszała drugiej.
//
// Kopie zdążyły się już rozjechać. Dla pustej listy pozycji Dashboard uznawał
// `anyPriceLoaded` za true, a Portfolio za false — czyli ten sam portfel mógł
// pokazać "0" na jednej stronie i wartość ze snapshotu na drugiej. Tutaj
// obowiązuje wariant z Dashboardu (z jawnym warunkiem na pustą listę).
//
// positions: [{ valuePLN, costPLN }]  — valuePLN === null gdy brak notowania
// snapshots: [{ date: 'YYYY-MM-DD', total }]
// extraValue: gotówka + inne aktywa, już przeliczone na PLN (Dashboard liczy
//             wartość całego majątku, Portfolio tylko same pozycje)
export function computePortfolioValue(positions, snapshots = [], extraValue = 0) {
  const pricesLoaded   = positions.length === 0 || positions.every(p => p.valuePLN != null);
  const anyPriceLoaded = positions.length === 0 || positions.some(p => p.valuePLN != null);

  // Suma tylko wycenionych pozycji — do wykresu kołowego i udziałów procentowych.
  const positionsValue = positions.reduce((s, p) => s + (p.valuePLN ?? 0), 0);
  // Wartość do nagłówka: pozycje z ceną po rynku, a te bez ceny (delisting,
  // zmiana tickera, chwilowy brak notowania) po koszcie zakupu — żeby JEDEN
  // brakujący symbol nie zamrażał całej wartości na wczorajszym snapshocie.
  const hybridValue = positions.reduce((s, p) => s + (p.valuePLN ?? p.costPLN ?? 0), 0);

  let totalValue;
  let staleTotal = false;
  if (anyPriceLoaded) {
    totalValue = hybridValue + extraValue;
  } else {
    // Snapshot pokazujemy tylko dopóki NIC nie zdążyło się załadować —
    // pierwsze sekundy po wejściu albo padnięte źródło notowań.
    const latestSnap = snapshots.length
      ? [...snapshots].sort((a, b) => b.date.localeCompare(a.date))[0]
      : null;
    totalValue = latestSnap ? latestSnap.total : null;
    staleTotal = totalValue != null;
  }

  return {
    totalValue,
    positionsValue,
    hybridValue,
    pricesLoaded,
    anyPriceLoaded,
    staleTotal,                                   // pokazujemy dane z ostatniej sesji
    partialPrices: anyPriceLoaded && !pricesLoaded, // żywa wartość, ale część pozycji po koszcie
  };
}
