// Dopasowanie w palecie ⌘K: bez wielkości liter i polskich znaków
// („zamk" → „Zamknięte"), litery zapytania w kolejności. Wynik: im wyżej,
// tym lepiej; null = brak dopasowania.
const strip = s => String(s ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l');

export function matchScore(query, text) {
  const q = strip(query).trim();
  if (!q) return 0;
  const s = strip(text);
  if (s.startsWith(q)) return 1000 - s.length;                    // początek
  const word = s.split(/[\s./-]+/).findIndex(w => w.startsWith(q));
  if (word >= 0) return 800 - word * 10 - s.length;               // początek słowa
  const at = s.indexOf(q);
  if (at >= 0) return 600 - at - s.length;                        // fragment
  let i = 0, gaps = 0, last = -1;                                 // litery po kolei
  for (let k = 0; k < s.length && i < q.length; k++) {
    if (s[k] === q[i]) { if (last >= 0) gaps += k - last - 1; last = k; i++; }
  }
  return i === q.length ? 300 - gaps - s.length : null;
}

// items: [{ id, label, keywords? }] → posortowane po dopasowaniu (stabilnie).
export function rankCommands(items, query) {
  if (!query.trim()) return items;
  return items
    .map((it, idx) => {
      const scores = [it.label, ...(it.keywords ?? [])].map(t => matchScore(query, t)).filter(v => v != null);
      return scores.length ? { it, idx, score: Math.max(...scores) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map(x => x.it);
}
