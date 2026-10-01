import { lsSet } from '../../utils/safeStorage.js';

// Lokalna lista „obserwuj" z menu ⋯ przy pozycji (osobna od /api/watchlist,
// na której żyją alerty cenowe).
const WATCH_KEY = 'myfund_watchlist';

function read() {
  try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); } catch { return []; }
}

export function toggleWatchlist(symbol) {
  const list = read();
  const idx = list.indexOf(symbol);
  if (idx === -1) list.push(symbol); else list.splice(idx, 1);
  lsSet(WATCH_KEY, JSON.stringify(list));
  return idx === -1;
}

export function isWatched(symbol) {
  return read().includes(symbol);
}
