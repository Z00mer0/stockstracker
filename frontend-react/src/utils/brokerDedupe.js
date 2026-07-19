// Deduplikacja transakcji z importu brokera.
//
// Klucz MUSI zawierać ilość, a porównanie musi być multisetowe (liczyć
// wystąpienia), bo kilka identycznych transakcji jednego dnia po tej samej
// cenie to normalna sytuacja (np. trzykrotne "CLOSE BUY 1/3 @ 34.91").
// Zbiorowa deduplikacja po samym kluczu zjadała takie wiersze i zaniżała
// stan pozycji po imporcie.

export function txKey(tx) {
  const price = Number(tx.price);
  const qty = tx.qty == null ? '' : Number(tx.qty).toFixed(4);
  return `${tx.symbol}_${tx.date}_${tx.type}_${isNaN(price) ? '' : price.toFixed(4)}_${qty}`;
}

// Scala transakcje z wielu plików/arkuszy jednej partii.
// Ten sam trade może pojawić się w Closed Positions i Cash Operations —
// dla każdego klucza bierzemy maksymalną liczbę wystąpień z pojedynczego
// arkusza (nie sumę). Wewnątrz jednego arkusza nic nie jest wyrzucane.
export function dedupeBatch(perSheetTransactions) {
  const target = new Map();
  for (const txs of perSheetTransactions) {
    const counts = new Map();
    for (const tx of txs) {
      const k = txKey(tx);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [k, c] of counts) {
      target.set(k, Math.max(target.get(k) ?? 0, c));
    }
  }
  const used = new Map();
  const out = [];
  for (const txs of perSheetTransactions) {
    for (const tx of txs) {
      const k = txKey(tx);
      const u = used.get(k) ?? 0;
      if (u < (target.get(k) ?? 0)) {
        used.set(k, u + 1);
        out.push(tx);
      }
    }
  }
  return out;
}

// Odfiltrowuje transakcje już zaimportowane wcześniej.
// Multiset difference: jeśli w historii są 2 wystąpienia klucza, pomijamy
// dokładnie 2 z partii — trzecie identyczne przechodzi jako nowe.
export function dedupeAgainstExisting(txs, existingTransactions) {
  const existingIds = new Set(
    existingTransactions.map(t => t.brokerPositionId).filter(Boolean)
  );
  const existingCounts = new Map();
  for (const t of existingTransactions) {
    const k = txKey(t);
    existingCounts.set(k, (existingCounts.get(k) ?? 0) + 1);
  }
  const used = new Map();
  return txs.filter(tx => {
    if (tx.brokerPositionId && existingIds.has(tx.brokerPositionId)) return false;
    const k = txKey(tx);
    const u = used.get(k) ?? 0;
    if (u < (existingCounts.get(k) ?? 0)) {
      used.set(k, u + 1);
      return false;
    }
    return true;
  });
}
