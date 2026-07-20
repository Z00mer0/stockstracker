// Deduplikacja transakcji z importu brokera.
//
// Dwie osobne klasy problemów:
//
// 1. WEWNĄTRZ arkusza: kilka identycznych transakcji jednego dnia po tej
//    samej cenie (np. trzykrotne "CLOSE BUY 1/3 @ 34.91") to NIE duplikaty.
//    Dlatego klucz zawiera ilość, a porównania są multisetowe (liczą
//    wystąpienia zamiast pamiętać "czy klucz już był").
//
// 2. MIĘDZY arkuszami: Closed Positions i Cash Operations opisują te same
//    transakcje, ale inaczej zapisane — arkusz zamkniętych AGREGUJE
//    (jeden wiersz "volume 3"), gotówkowy ma trzy osobne wiersze po 1 szt.
//    Ścisłe porównanie kluczy tego nie scali, więc Cash Operations jest
//    źródłem prawdy: wiersz z Closed Positions odpada, jeśli jego ilość
//    mieści się w puli gotówkowej po (symbol, typ, data, cena). Zostają
//    tylko niepokryte (np. otwarcie pozycji sprzed okna eksportu).

export function txKey(tx) {
  const qty = tx.qty == null ? '' : Number(tx.qty).toFixed(4);
  return `${coarseKey(tx)}_${qty}`;
}

// Klucz bez ilości — do dopasowywania zagregowanych wierszy między arkuszami.
function coarseKey(tx) {
  const price = Number(tx.price);
  return `${tx.symbol}_${tx.date}_${tx.type}_${isNaN(price) ? '' : price.toFixed(4)}`;
}

// Scala wiele arkuszy TEGO SAMEGO rodzaju: dla każdego klucza bierze
// maksymalną liczbę wystąpień z pojedynczego arkusza (nie sumę), więc ten
// sam plik wgrany dwa razy się nie dubluje, a powtórzone legalne
// transakcje w jednym arkuszu zostają.
function multisetMax(sheets) {
  const target = new Map();
  for (const txs of sheets) {
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
  for (const txs of sheets) {
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

// Scala transakcje z wielu plików/arkuszy jednej partii.
export function dedupeBatch(perSheetTransactions) {
  const cashSheets = [];
  const closedSheets = [];
  for (const txs of perSheetTransactions) {
    const cash = txs.filter(t => !t.fromClosedPosition);
    const closed = txs.filter(t => t.fromClosedPosition);
    if (cash.length) cashSheets.push(cash);
    if (closed.length) closedSheets.push(closed);
  }

  const cash = multisetMax(cashSheets);
  const closed = multisetMax(closedSheets);
  if (!closed.length) return cash;

  // Pula pokrycia z operacji gotówkowych: (symbol, typ, data, cena) → suma szt.
  const pool = new Map();
  for (const tx of cash) {
    if ((tx.type !== 'BUY' && tx.type !== 'SELL') || !tx.qty) continue;
    const k = coarseKey(tx);
    pool.set(k, (pool.get(k) ?? 0) + Number(tx.qty));
  }

  const out = [...cash];
  for (const tx of closed) {
    const q = Number(tx.qty) || 0;
    const k = coarseKey(tx);
    const avail = pool.get(k) ?? 0;
    if (q > 0 && avail >= q - 1e-9) {
      pool.set(k, avail - q); // pokryte przez operacje gotówkowe → duplikat
    } else {
      out.push(tx); // niepokryte (np. otwarcie sprzed okna eksportu) → zostaje
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
  // Coverage pool from existing CASH transactions: (symbol, type, date, price) → total qty.
  // Used to reconcile a new AGGREGATED closed-position row against per-fill cash rows
  // already in history (import Cash Ops one session, Closed Positions the next).
  const cashPool = new Map();
  for (const t of existingTransactions) {
    const k = txKey(t);
    existingCounts.set(k, (existingCounts.get(k) ?? 0) + 1);
    if (!t.fromClosedPosition && (t.type === 'BUY' || t.type === 'SELL') && t.qty > 0) {
      const ck = coarseKey(t);
      cashPool.set(ck, (cashPool.get(ck) ?? 0) + Number(t.qty));
    }
  }
  const usedCount = new Map();
  const usedPool  = new Map();
  return txs.filter(tx => {
    if (tx.brokerPositionId && existingIds.has(tx.brokerPositionId)) return false;
    // Cross-session reconciliation for aggregated closed rows.
    if (tx.fromClosedPosition && (tx.type === 'BUY' || tx.type === 'SELL') && Number(tx.qty) > 0) {
      const ck = coarseKey(tx);
      const avail = (cashPool.get(ck) ?? 0) - (usedPool.get(ck) ?? 0);
      if (avail >= Number(tx.qty) - 1e-9) {
        usedPool.set(ck, (usedPool.get(ck) ?? 0) + Number(tx.qty));
        return false;
      }
    }
    // Fallback: strict multiset difference on full key (with qty).
    const k = txKey(tx);
    const u = usedCount.get(k) ?? 0;
    if (u < (existingCounts.get(k) ?? 0)) {
      usedCount.set(k, u + 1);
      return false;
    }
    return true;
  });
}
