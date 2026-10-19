// Wpływ transakcji na pozycje i gotówkę portfela.
//
// Pozycje i historia są zapisane osobno — pozycje pochodzą też z importów
// brokera i ręcznych korekt, które w historii śladu nie mają — więc pozycji
// nie da się po prostu odtworzyć z historii. Zamiast tego transakcja dodana
// w aplikacji od razu zmienia pozycję i gotówkę, a w `effect` zapisuje, co
// dokładnie zmieniła. Usunięcie cofa dokładnie to; transakcja bez `effect`
// (starsza albo dopisana tylko do historii) niczego nie cofa.
//   effect: { qty?: akcje dodane (+) / zdjęte (−), ratio?: split,
//             cash?: zmiana gotówki w walucie transakcji }
import { weightedAvg } from './weightedAvg.js';
import { normalizeType } from './transactions.js';
import { holdingsAt } from './investedAtDate.js';

const EPS = 1e-9;
const newId = () => Math.random().toString(36).slice(2, 10);

// XTB.PL i XTB.WA to ta sama spółka (import brokera dopasowuje tak samo).
export function baseSymbol(sym) {
  return String(sym).replace(/\.(WA|PL|US|UK|DE|FR|NL|IT|ES|SE|DK|NO|FI|BE|AT|CH)$/i, '').toUpperCase();
}

// Kwota, o jaką transakcja zmienia gotówkę (CASH: znak w cenie, wpłata +).
export function cashAmount(tx) {
  const type = normalizeType(tx.type);
  const gross = (tx.qty ?? 1) * (tx.price ?? 0);
  if (type === 'BUY') return -gross;
  if (type === 'SELL' || type === 'DIV') return gross;
  if (type === 'CASH') return Number(tx.price) || 0;
  return 0;
}

// opts.positions — zmienić pozycję (BUY/SELL/SPLIT);
// opts.cash — zmienić gotówkę (BUY/SELL/DIV; CASH zmienia ją zawsze).
// Zwraca { holdings, cash, tx } — tx z dopisanym `effect`.
export function applyTransaction({ holdings = [], cash = {} }, tx, { positions = true, cash: toCash = false } = {}) {
  const type = normalizeType(tx.type);
  const cur = tx.currency || 'PLN';
  const effect = {};
  let nextHoldings = holdings;
  let nextCash = cash;
  let out = tx;

  if (positions && (type === 'BUY' || type === 'SELL' || type === 'SPLIT')) {
    const h = holdings.find(x => x.symbol === tx.symbol);
    if (h && type !== 'SPLIT' && h.currency && h.currency !== cur) {
      throw new Error(`Pozycja ${tx.symbol} jest w ${h.currency}, a transakcja w ${cur}`);
    }
    if (type === 'BUY') {
      nextHoldings = h
        ? holdings.map(x => x === h ? { ...x, qty: x.qty + tx.qty, avgPrice: weightedAvg(x.qty, x.avgPrice, tx.qty, tx.price) } : x)
        : [...holdings, { id: newId(), symbol: tx.symbol, qty: tx.qty, avgPrice: tx.price, currency: cur, date: tx.date, name: '' }];
      effect.qty = tx.qty;
    } else if (type === 'SELL') {
      if (!h || tx.qty > h.qty + EPS) throw new Error(`Za mało akcji ${tx.symbol} w portfelu (jest ${h?.qty ?? 0})`);
      const left = h.qty - tx.qty;
      nextHoldings = left <= EPS ? holdings.filter(x => x !== h) : holdings.map(x => x === h ? { ...x, qty: left } : x);
      effect.qty = -tx.qty;
      if (out.costBasis == null) out = { ...out, costBasis: h.avgPrice };
    } else {
      if (!h) throw new Error(`Nie znaleziono pozycji ${tx.symbol}`);
      nextHoldings = holdings.map(x => x === h ? { ...x, qty: x.qty * tx.ratio, avgPrice: x.avgPrice / tx.ratio } : x);
      effect.ratio = tx.ratio;
    }
  }

  if (type === 'CASH' || (toCash && (type === 'BUY' || type === 'SELL' || type === 'DIV'))) {
    let delta = cashAmount(tx);
    // Zakup za więcej, niż jest gotówki, zdejmuje ją do zera (jak dotąd
    // przy dodawaniu pozycji). Zapisana jest faktyczna zmiana.
    if (type === 'BUY') delta = Math.max(delta, -Math.max(0, cash[cur] ?? 0));
    if (delta) {
      nextCash = { ...cash, [cur]: (cash[cur] ?? 0) + delta };
      effect.cash = delta;
    }
  }

  if (Object.keys(effect).length) out = { ...out, effect };
  return { holdings: nextHoldings, cash: nextCash, tx: out };
}

// Cofa `effect` transakcji. Pozycja, którą w międzyczasie usunięto, przy
// cofnięciu zakupu zostaje usunięta; przy cofnięciu sprzedaży wraca po
// koszcie z dnia sprzedaży.
export function revertTransaction({ holdings = [], cash = {} }, tx) {
  const e = tx.effect;
  if (!e) return { holdings, cash };
  const cur = tx.currency || 'PLN';
  let nextHoldings = holdings;
  const h = holdings.find(x => x.symbol === tx.symbol);

  if (e.qty > 0 && h) {
    const left = h.qty - e.qty;
    if (left <= EPS) {
      nextHoldings = holdings.filter(x => x !== h);
    } else {
      // Średnia bez tego zakupu; dokładna, o ile pozycja nie zmieniała się
      // w inny sposób niż sprzedażą (sprzedaż średniej nie rusza).
      const avg = (h.qty * h.avgPrice - e.qty * tx.price) / left;
      nextHoldings = holdings.map(x => x === h ? { ...x, qty: left, avgPrice: avg > 0 ? avg : x.avgPrice } : x);
    }
  } else if (e.qty < 0) {
    nextHoldings = h
      ? holdings.map(x => x === h ? { ...x, qty: x.qty - e.qty } : x)
      : [...holdings, { id: newId(), symbol: tx.symbol, qty: -e.qty, avgPrice: tx.costBasis ?? tx.price, currency: cur, date: tx.date, name: '' }];
  } else if (e.ratio > 0 && h) {
    nextHoldings = holdings.map(x => x === h ? { ...x, qty: x.qty / e.ratio, avgPrice: x.avgPrice * e.ratio } : x);
  }

  const nextCash = e.cash ? { ...cash, [cur]: (cash[cur] ?? 0) - e.cash } : cash;
  return { holdings: nextHoldings, cash: nextCash };
}

// Pozycje, których ilość nie zgadza się z historią transakcji — zostały po
// zmianach sprzed wspólnego zapisu, ręcznych korektach albo importach.
// Zwraca [{ symbol, history, portfolio, avgPrice, currency }].
export function positionMismatches(transactions = [], holdings = []) {
  const fromHistory = new Map();
  for (const [sym, h] of holdingsAt(transactions)) {
    const k = baseSymbol(sym);
    const prev = fromHistory.get(k);
    fromHistory.set(k, { symbol: prev?.symbol ?? sym, qty: (prev?.qty ?? 0) + h.qty, currency: h.currency });
  }
  const held = new Map();
  for (const h of holdings) {
    const k = baseSymbol(h.symbol);
    const prev = held.get(k);
    held.set(k, { symbol: h.symbol, qty: (prev?.qty ?? 0) + (h.qty ?? 0), avgPrice: h.avgPrice, currency: h.currency });
  }
  const out = [];
  for (const k of new Set([...fromHistory.keys(), ...held.keys()])) {
    const a = fromHistory.get(k)?.qty ?? 0;
    const b = held.get(k)?.qty ?? 0;
    if (Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b))) continue;
    out.push({
      symbol: held.get(k)?.symbol ?? fromHistory.get(k).symbol,
      history: a,
      portfolio: b,
      avgPrice: held.get(k)?.avgPrice ?? null,
      currency: held.get(k)?.currency ?? fromHistory.get(k).currency,
    });
  }
  return out.sort((x, y) => x.symbol.localeCompare(y.symbol));
}
