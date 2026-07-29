// Replay transakcji do daty snapshotu → zwraca invested per waluta w tej dacie
// (sum(qty * avgPrice) per currency, po weighted-average z BUY-ów i redukcji z SELL-i).
// Nie używa fx, nie przelicza — dopiero caller mnoży przez fx dla waluty wyświetlania.
// Zaleta: dla USD-only portfela wyświetlanego w USD, invested nie "oddycha" z NBP.
import { weightedAvg } from './weightedAvg.js';

// Zwraca { CCY: sumOfQtyTimesAvgPrice } po zastosowaniu transakcji <= date.
// Kolejność w obrębie dnia: BUY przed SELL (żeby same-day sprzedaż miała pokrycie).
export function investedByCurrencyAt(transactions, date) {
  const relevant = (transactions || [])
    // fromClosedPosition BUY-e są fabrykowane pod SELL z importu — nie ruszają holdings.
    .filter(tx => (tx.type === 'BUY' || tx.type === 'SELL') && tx.qty > 0
              && (tx.date || '') <= date && !tx.fromClosedPosition)
    .sort((a, b) => {
      const d = (a.date || '').localeCompare(b.date || '');
      if (d !== 0) return d;
      return (a.type === 'BUY' ? 0 : 1) - (b.type === 'BUY' ? 0 : 1);
    });

  // Per symbol → { qty, avg, currency }. Same-symbol w różnych walutach: bierzemy
  // walutę pierwszego BUY-a jako kanon (i tak w portfelu jeden symbol = jedna waluta).
  // fromSnapshot BUY: replace stanu (snapshot importu brokera = autorytatywna baseline
  // z ich avgPrice), zgodnie z AppContext:504-509. Kolejne "zwykłe" BUY po snapshotcie
  // dokładają się weighted-avg do tej baseline.
  const holdings = new Map();
  for (const tx of relevant) {
    const cur = tx.currency || 'PLN';
    const h = holdings.get(tx.symbol) || { qty: 0, avg: 0, currency: cur };
    if (tx.type === 'BUY') {
      if (tx.fromSnapshot) {
        h.qty = tx.qty;
        h.avg = tx.price;
        h.currency = cur;
      } else {
        h.avg = weightedAvg(h.qty, h.avg, tx.qty, tx.price);
        h.qty = h.qty + tx.qty;
        h.currency = h.currency || cur;
      }
    } else {
      h.qty = Math.max(0, h.qty - tx.qty);
      if (h.qty === 0) h.avg = 0;
    }
    holdings.set(tx.symbol, h);
  }

  const byCur = {};
  for (const h of holdings.values()) {
    if (h.qty <= 0 || h.avg <= 0) continue;
    byCur[h.currency] = (byCur[h.currency] || 0) + h.qty * h.avg;
  }
  return byCur;
}

// Wygodny wrapper: invested w walucie wyświetlania (używa fx z parametru — może być
// z snapshotu (frozen) albo bieżących fxRates). Dla portfela w tej samej walucie co
// displayCurrency (i tylko tej), fx = 1 i wynik jest dokładnie constant.
export function investedInDisplayAt(transactions, date, displayCurrency, fxRatesForDate) {
  const sumPLN = investedPlnAt(transactions, date, fxRatesForDate);
  const dispFx = fxRatesForDate?.[displayCurrency] ?? 1;
  return (sumPLN ?? 0) / dispFx;
}

// Invested w PLN na dany dzień — kursy per waluta z `fxRatesForDate`.
// Zwraca null gdy w tej dacie nie było jeszcze żadnej pozycji: wykres traktuje
// null jako "brak danych" i nie rysuje punktu, zero rysowałoby fałszywą linię.
export function investedPlnAt(transactions, date, fxRatesForDate) {
  const byCur = investedByCurrencyAt(transactions, date);
  let sumPLN = 0;
  for (const [ccy, amount] of Object.entries(byCur)) {
    sumPLN += amount * (fxRatesForDate?.[ccy] ?? 1);
  }
  return sumPLN > 0 ? sumPLN : null;
}

// Kursy dla snapshotu: własne > najbliższy WCZEŚNIEJSZY snapshot z kursami >
// najwcześniejszy jaki mamy. Dzisiejszych kursów celowo tu nie ma.
//
// Dlaczego to ma znaczenie: `invested` jest zapisany w PLN, przeliczony kursem
// z dnia zapisu. Podzielenie go przez DZISIEJSZY kurs daje liczbę, która zmienia
// się codziennie razem z NBP — czyli "zainwestowane" rośnie i maleje mimo braku
// transakcji. Historyczny wiersz musi być przeliczany kursem ze swojej epoki.
//
// snapshotsAsc: lista snapshotów posortowana rosnąco po dacie.
export function fxForSnapshot(snap, snapshotsAsc) {
  if (snap?.fx) return snap.fx;
  if (!Array.isArray(snapshotsAsc) || !snap?.date) return null;
  let earlier = null;
  let firstWithFx = null;
  for (const s of snapshotsAsc) {
    if (!s?.fx || !s.date) continue;
    if (firstWithFx === null) firstWithFx = s.fx;
    if (s.date <= snap.date) earlier = s.fx;
    else break;
  }
  return earlier ?? firstWithFx;
}
