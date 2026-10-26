// Kursy walut z dni transakcji — żeby wynik w złotych liczył też zmianę
// kursu. Wcześniej koszt zakupu w USD przeliczano dzisiejszym kursem, więc
// akcje kupione po 4,30 zł/$ przy dolarze po 3,60 nie pokazywały straty na
// walucie (Historia ją pokazywała — strony się nie zgadzały).
//   hist: { USD: { '2025-03-05': 4.01, … } } — kursy średnie NBP z tych dni
//   (serwer cofa się przez weekend i święta do ostatniej tabeli).
import { normalizeType, txAmount, txFee, buyUnitCost, divNet } from './transactions.js';

// Daty do pobrania: { USD: Set(dat) } — kupno, sprzedaż i dywidendy w walucie.
export function fxDatesNeeded(transactions = []) {
  const out = {};
  for (const t of transactions) {
    const type = normalizeType(t.type);
    if ((type !== 'BUY' && type !== 'SELL' && type !== 'DIV') || !t.date) continue;
    const ccy = t.currency || 'PLN';
    if (ccy === 'PLN') continue;
    (out[ccy] ??= new Set()).add(t.date.slice(0, 10));
  }
  return out;
}

export function rateOn(hist, ccy, date) {
  if ((ccy || 'PLN') === 'PLN') return 1;
  return hist?.[ccy]?.[String(date ?? '').slice(0, 10)] ?? null;
}

// Średni kurs zakupu trzymanych akcji (ważony kosztem, metoda średniej jak
// avgPrice w portfelu: sprzedaż nie zmienia średniej). Na transakcjach już
// po splitAdjusted. Zwraca:
//   bySymbol: Map symbol → kurs (null, gdy brakuje kursu któregoś zakupu)
//   atSell:   Map transakcja SELL → kurs kosztu sprzedanych akcji (albo null)
export function replayFx(transactions, hist) {
  const bySym = new Map();
  for (const t of transactions) {
    const type = normalizeType(t.type);
    if ((type !== 'BUY' && type !== 'SELL') || !(t.qty > 0) || t.fromClosedPosition) continue;
    if (!bySym.has(t.symbol)) bySym.set(t.symbol, []);
    bySym.get(t.symbol).push({ t, type });
  }
  const bySymbol = new Map();
  const atSell = new Map();
  for (const [sym, list] of bySym) {
    list.sort((a, b) => (a.t.date || '').localeCompare(b.t.date || '') || (a.type === 'BUY' ? 0 : 1) - (b.type === 'BUY' ? 0 : 1));
    let qty = 0, native = 0, pln = 0, known = true;
    for (const { t, type } of list) {
      const rate = rateOn(hist, t.currency, t.date);
      if (type === 'BUY') {
        const cost = t.fromSnapshot ? t.qty * (t.price ?? 0) : t.qty * buyUnitCost(t);
        if (t.fromSnapshot) { qty = 0; native = 0; pln = 0; known = true; }
        qty += t.qty;
        native += cost;
        if (rate == null) known = false; else pln += cost * rate;
      } else {
        atSell.set(t, known && native > 0 ? pln / native : null);
        const f = qty > 0 ? Math.min(1, t.qty / qty) : 1;
        qty = Math.max(0, qty - t.qty);
        native *= 1 - f;
        pln *= 1 - f;
        if (qty <= 1e-9) { qty = 0; native = 0; pln = 0; known = true; }
      }
    }
    bySymbol.set(sym, known && native > 0 ? pln / native : null);
  }
  return { bySymbol, atSell };
}

// Przepływ transakcji w PLN po kursie z jej dnia (bez kursu — dzisiejszym):
// zakup ujemny z prowizją, sprzedaż po prowizji, dywidenda po podatku.
export function cashflowPLN(t, hist, fxRates = {}) {
  const type = normalizeType(t.type);
  const rate = rateOn(hist, t.currency, t.date) ?? fxRates[t.currency] ?? 1;
  if (type === 'BUY') return -(txAmount(t) + txFee(t)) * rate;
  if (type === 'SELL') return (txAmount(t) - txFee(t)) * rate;
  if (type === 'DIV') return divNet({ ...t, qty: t.qty || 1, price: t.price || 0 }) * rate;
  return 0;
}
