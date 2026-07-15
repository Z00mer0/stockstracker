// Dziennik inwestora — tezy per spółka + retrospekcje po sprzedaży.
// Przechowywany na serwerze (/api/journal), więc synchronizuje się między urządzeniami.
// Kształt: { theses: { SYM: { text, updatedAt } }, retros: { <sellTxId>: { symbol, date, verdict, note, hadThesis } } }
import { api } from '../hooks/useApi';
import { loadPositionNotes, migrateLegacyNotes } from '../utils/positionNotes';

let cache = null;
let pending = null;

function empty() {
  return { theses: {}, retros: {} };
}

export async function loadJournal() {
  if (cache) return cache;
  if (pending) return pending;
  pending = (async () => {
    let data = {};
    try {
      const res = await api.get('/api/journal');
      data = res.data && typeof res.data === 'object' ? res.data : {};
    } catch {
      data = {};
    }
    const journal = { ...empty(), ...data };
    // Jednorazowa migracja lokalnych notatek (myfund_position_notes) na serwer
    try {
      migrateLegacyNotes();
      const local = loadPositionNotes();
      let migrated = false;
      for (const [sym, entry] of Object.entries(local)) {
        if (entry?.text && !journal.theses[sym]?.text) {
          journal.theses[sym] = { text: entry.text, updatedAt: entry.updatedAt || new Date().toISOString() };
          migrated = true;
        }
      }
      if (migrated) await api.post('/api/journal', journal);
    } catch {}
    cache = journal;
    pending = null;
    return journal;
  })();
  return pending;
}

async function persist() {
  if (!cache) return;
  await api.post('/api/journal', cache);
}

export async function getThesis(symbol) {
  const j = await loadJournal();
  return j.theses[symbol]?.text || '';
}

export async function setThesis(symbol, text) {
  const j = await loadJournal();
  if (text.trim()) {
    j.theses[symbol] = { text: text.trim(), updatedAt: new Date().toISOString() };
  } else {
    delete j.theses[symbol];
  }
  await persist();
}

export async function addRetro(txId, retro) {
  const j = await loadJournal();
  j.retros[txId] = retro;
  await persist();
}

// Czyści cache przy zmianie użytkownika (wylogowanie/logowanie)
export function resetJournalCache() {
  cache = null;
  pending = null;
}
