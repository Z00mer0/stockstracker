// Etykiety transakcji (np. „emerytura", „spekulacja") i widok portfela
// zbudowany tylko z oznaczonych transakcji.
import { holdingsAt } from './investedAtDate.js';

const MAX_LABELS = 5;
const MAX_LEN = 24;

/** „Emerytura, spekulacja" → ['emerytura', 'spekulacja'] (małe litery, bez powtórzeń). */
export function parseLabels(input) {
  const parts = Array.isArray(input) ? input : String(input ?? '').split(',');
  const out = [];
  for (const p of parts) {
    const l = String(p).trim().toLowerCase().slice(0, MAX_LEN);
    if (l && !out.includes(l)) out.push(l);
  }
  return out.slice(0, MAX_LABELS);
}

/** Wszystkie etykiety użyte w transakcjach, alfabetycznie. */
export function allLabels(transactions = []) {
  const set = new Set();
  for (const t of transactions) for (const l of t.labels ?? []) set.add(l);
  return [...set].sort((a, b) => a.localeCompare(b));
}

const hasAny = (tx, wanted) => (tx.labels ?? []).some(l => wanted.has(l));

/**
 * Dane portfela ograniczone do transakcji z którąś z etykiet. Pozycje są
 * odtwarzane z tych transakcji; gotówki, historii wartości, obligacji i innych
 * aktywów nie da się przypisać do etykiety, więc w takim widoku ich nie ma.
 */
export function labelView(data, labels) {
  const wanted = new Set(parseLabels(labels));
  if (!data || !wanted.size) return data;
  const transactions = (data.transactions ?? []).filter(t => hasAny(t, wanted));
  const known = new Map((data.portfolio?.holdings ?? []).map(h => [h.symbol, h]));
  const holdings = [];
  for (const [symbol, h] of holdingsAt(transactions)) {
    if (!(h.qty > 1e-9)) continue;
    const src = known.get(symbol);
    holdings.push({
      id: src?.id ?? symbol, symbol, qty: h.qty, avgPrice: h.avg, currency: h.currency,
      name: src?.name ?? '', ...(src?.assetType ? { assetType: src.assetType } : {}),
    });
  }
  return {
    ...data,
    portfolio: { ...data.portfolio, holdings },
    transactions,
    cash: {}, bonds: [], otherAssets: [],
    snapshots: {}, snapshotsInvested: {}, snapshotsCapital: {}, snapshotsCapitalNative: {}, snapshotsFx: {},
  };
}
