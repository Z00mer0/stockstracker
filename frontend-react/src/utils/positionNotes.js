const NOTES_KEY = 'myfund_position_notes';

export function loadPositionNotes() {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); } catch { return {}; }
}

export function savePositionNotes(data) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(data));
}

export function getPositionNote(symbol) {
  return loadPositionNotes()[symbol]?.text || '';
}

export function setPositionNote(symbol, text) {
  const all = loadPositionNotes();
  if (text.trim()) {
    all[symbol] = { text: text.trim(), updatedAt: new Date().toISOString() };
  } else {
    delete all[symbol];
  }
  savePositionNotes(all);
}

export function migrateLegacyNotes() {
  try {
    const all = loadPositionNotes();
    let changed = false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('myfund_note_')) {
        const symbol = key.slice('myfund_note_'.length);
        const text = localStorage.getItem(key);
        if (text && text.trim() && !all[symbol]?.text) {
          all[symbol] = { text, updatedAt: new Date().toISOString() };
          changed = true;
        }
      }
    }
    if (changed) savePositionNotes(all);
  } catch {}
}
