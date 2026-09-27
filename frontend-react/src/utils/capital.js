// Kapitał własny portfela — ile pieniędzy użytkownik do niego włożył
// (wpłaty − wypłaty). Bez tego Historia liczyła każdą dokupioną pozycję
// i każdą wpłatę jako zysk (demo: +381% przy faktycznych +12,5%).
//
// Aplikacja nie zapisuje wpłat wprost — gotówkę można poprawić ręcznie,
// pozycję dodać bez ruszania gotówki — więc kapitał bierzemy z tożsamości
// rachunku:
//   wartość = pozycje + gotówka = kapitał + zysk
//   zysk    = (pozycje − koszt) + zrealizowany + dywidendy
//   ⇒ kapitał = koszt pozycji + gotówka − zrealizowany − dywidendy
// Wycena pozycji się skraca, więc do kapitału nie potrzeba cen.
import { computeRealizedTrades } from './realizedPL.js';
import { normalizeType } from './transactions.js';

const divAmount = tx => (tx.price || 0) * (tx.qty || 1);

// Składniki kapitału per waluta, w jej jednostkach (bez kursów).
export function capitalNative({ holdings = [], cash = {}, transactions = [] }) {
  const out = {};
  const add = (ccy, v) => {
    if (!v) return;
    const c = ccy || 'PLN';
    out[c] = (out[c] ?? 0) + v;
  };
  for (const h of holdings) add(h.currency, (h.qty ?? 0) * (h.avgPrice ?? 0));
  for (const [ccy, amt] of Object.entries(cash)) add(ccy, Number(amt) || 0);
  for (const trade of computeRealizedTrades(transactions, {})) add(trade.currency, -trade.plNative);
  for (const tx of transactions) if (normalizeType(tx.type) === 'DIV') add(tx.currency, -divAmount(tx));
  return out;
}

// Kapitał w PLN na dziś. Różnica składników względem poprzedniego snapshotu
// to wpłata albo wypłata — wyceniamy ją po DZISIEJSZYM kursie i dopisujemy.
// Sam ruch kursu wpłatą nie jest, więc kapitał od niego się nie zmienia,
// a zysk na walucie trafia do wyniku (tak jak powinien u inwestora
// liczącego w złotych). Bez poprzedniego snapshotu — wycena składników.
//   prev: { capital, native } | null
export function nextCapital(prev, native, fx = {}) {
  const rate = c => fx[c] ?? 1;
  if (!prev || prev.capital == null || !prev.native) {
    return Object.entries(native).reduce((s, [c, v]) => s + v * rate(c), 0);
  }
  let flow = 0;
  for (const c of new Set([...Object.keys(native), ...Object.keys(prev.native)])) {
    flow += ((native[c] ?? 0) - (prev.native[c] ?? 0)) * rate(c);
  }
  return prev.capital + flow;
}

// Ostatni snapshot przed `date` z zapisanym kapitałem — punkt odniesienia
// dla nextCapital. Dzisiejszy pomijamy: ponowny zapis tego samego dnia ma
// liczyć przepływy od wczoraj, a nie od własnego poprzedniego zapisu.
export function lastCapitalBefore(snapshots, date) {
  let best = null;
  for (const s of snapshots) {
    if (s.date < date && s.capital != null && s.capitalNative && (!best || s.date > best.date)) best = s;
  }
  return best ? { capital: best.capital, native: best.capitalNative } : null;
}

// Kapitał na dziś — to samo do zapisu snapshotu i do żywego punktu wykresu.
export function todayCapital({ snapshots = [], holdings, cash, transactions, fxRates, today }) {
  const native = capitalNative({ holdings, cash, transactions });
  return { capital: nextCapital(lastCapitalBefore(snapshots, today), native, fxRates), native };
}

// Dni sprzed zapisywania kapitału (i dni, w których nikt go nie zapisał)
// dostają szacunek: koszt pozycji z tego dnia − zrealizowany zysk i
// dywidendy do tego dnia + stała K. K to gotówka z pierwszego dnia ze
// znanym kapitałem (albo bieżąca, gdy takiego dnia jeszcze nie ma) —
// czyli zakładamy, że gotówka się nie zmieniała. Wpłaty, za które od razu
// kupiono akcje, szacunek łapie (rośnie koszt pozycji); wpłat leżących na
// koncie — nie.
//   rows: rosnąco po dacie, { date, total, invested (PLN, koszt pozycji), capital? }
//   transactions: do zrealizowanego zysku i dywidend
//   fxRates: bieżące kursy (jak na Dashboardzie)
//   cashPLN: bieżąca gotówka w PLN (K, gdy brak dnia ze znanym kapitałem)
// Zwraca kopie wierszy z `capital` i `capitalEstimated`.
export function withCapital(rows, { transactions = [], fxRates = {}, cashPLN = 0 } = {}) {
  const trades = computeRealizedTrades(transactions, fxRates)
    .map(t => ({ date: t.date, pln: t.plPLN }));
  const divs = transactions
    .filter(tx => normalizeType(tx.type) === 'DIV')
    .map(tx => ({ date: tx.date || '', pln: divAmount(tx) * (fxRates[tx.currency] ?? 1) }));
  const earnedTo = date =>
    trades.reduce((s, t) => (t.date <= date ? s + t.pln : s), 0)
    + divs.reduce((s, d) => (d.date <= date ? s + d.pln : s), 0);

  const anchor = rows.find(r => r.capital != null && r.invested != null);
  const K = anchor ? anchor.capital - anchor.invested + earnedTo(anchor.date) : cashPLN;

  return rows.map(r => {
    if (r.capital != null) return { ...r, capitalEstimated: false };
    if (r.invested == null) return { ...r, capital: null, capitalEstimated: true };
    return { ...r, capital: r.invested - earnedTo(r.date) + K, capitalEstimated: true };
  });
}
