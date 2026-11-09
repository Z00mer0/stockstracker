// Ilości w aplikacji vs zakładka Open Positions z XTB. Różnica znaczy, że
// historia w pliku nie pokrywa całego rachunku (np. eksport od 2025, a akcje
// kupione wcześniej) albo że import czegoś nie zrozumiał.
import { normalizeSymbol, QTY_EPS } from './brokerImport.js';

const key = sym => normalizeSymbol(String(sym).toUpperCase());

// app: [{ symbol, qty, avgPrice, currency }]; broker: to samo po mergeBySymbol.
// → [{ symbol, appSymbol, appQty, brokerQty, diff, brokerAvg, currency }]
// Uwzględnia tylko instrumenty z rachunku XTB: pozycje spoza niego (krypto,
// ręcznie dopisane) nie są różnicą, o ile nie mają odpowiednika w XTB.
export function reconcileHoldings(app = [], broker = [], { onlyBrokerLike = true } = {}) {
  const appBy = new Map();
  for (const h of app) {
    const k = key(h.symbol);
    const prev = appBy.get(k);
    appBy.set(k, { symbol: prev?.symbol ?? h.symbol, qty: (prev?.qty ?? 0) + (h.qty ?? 0), currency: h.currency });
  }
  const brokerBy = new Map(broker.map(b => [key(b.symbol), b]));
  const out = [];
  for (const k of new Set([...appBy.keys(), ...brokerBy.keys()])) {
    const a = appBy.get(k), b = brokerBy.get(k);
    // Pozycja tylko w aplikacji: liczymy ją, jeśli wygląda na akcję z giełdy
    // obsługiwanej przez XTB (ma sufiks albo jest tickerem USA), nie krypto.
    if (!b && onlyBrokerLike && /-USD$|^BTC|^ETH/i.test(a.symbol)) continue;
    const appQty = a?.qty ?? 0, brokerQty = b?.qty ?? 0;
    const diff = brokerQty - appQty;
    if (Math.abs(diff) <= Math.max(QTY_EPS, 1e-6 * Math.abs(brokerQty))) continue;
    out.push({ symbol: b?.symbol ?? a.symbol, appSymbol: a?.symbol ?? null, appQty, brokerQty, diff, brokerAvg: b?.avgPrice ?? null, currency: b?.currency ?? a?.currency });
  }
  return out.sort((x, y) => x.symbol.localeCompare(y.symbol));
}

// Pozycje po poprawce „ustaw jak w XTB”: ilość z XTB, średnia z aplikacji
// (jest liczona z prowizjami) albo z XTB dla nowej pozycji; 0 → pozycja znika.
export function applyBrokerQuantities(holdings = [], diffs = []) {
  let next = holdings.map(h => ({ ...h }));
  for (const d of diffs) {
    const idx = next.findIndex(h => h.symbol === d.appSymbol);
    if (d.brokerQty <= QTY_EPS) { if (idx >= 0) next.splice(idx, 1); continue; }
    if (idx >= 0) next[idx] = { ...next[idx], qty: d.brokerQty };
    else next.push({ id: Math.random().toString(36).slice(2, 10), symbol: d.symbol, qty: d.brokerQty, avgPrice: d.brokerAvg ?? 0, currency: d.currency, name: '' });
  }
  return next;
}
