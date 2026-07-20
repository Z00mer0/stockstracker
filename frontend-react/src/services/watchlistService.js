// Wspólna logika watchlisty (jedno źródło prawdy dla alertów).
// Backend jest źródłem prawdy — localStorage tylko jako cache offline.

export const WATCH_KEY = 'myfund_watchlist';
export const OLD_PORTFOLIO_ALERTS_KEY = 'myfund_price_alerts';
export const MIGRATION_KEY = 'myfund_alerts_migrated_v1';

function authHeader() { return { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' }; }
export function genAlertId() { return Math.random().toString(36).slice(2, 10); }
function genItemId()  { return Math.random().toString(36).slice(2, 10); }

export async function apiLoadWatchlist() {
  const r = await fetch('/api/watchlist', { headers: authHeader(), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function apiSaveWatchlist(items) {
  const r = await fetch('/api/watchlist', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(items),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

export function loadWatchlistLocal() {
  try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); } catch { return []; }
}
export function saveWatchlistLocal(items) {
  localStorage.setItem(WATCH_KEY, JSON.stringify(items));
}

// Dodaje alert do items — jeśli symbol nie istnieje, tworzy nowy watch item.
// Zwraca nową tablicę items.
export function addAlertToItems(items, symbol, alert) {
  const sym = symbol.toUpperCase();
  const existing = items.find(w => w.symbol === sym);
  if (existing) {
    return items.map(w => w.symbol === sym
      ? { ...w, alerts: [...(w.alerts ?? []), alert] }
      : w);
  }
  return [...items, { id: genItemId(), symbol: sym, name: sym, alerts: [alert] }];
}

export function removeAlertFromItems(items, itemId, alertId) {
  return items.map(w => w.id === itemId
    ? { ...w, alerts: (w.alerts ?? []).filter(a => a.id !== alertId) }
    : w);
}

// Wszystkie alerty ze wszystkich items w flat postaci — z powrotem-ref do item.
export function collectAllAlerts(items) {
  const out = [];
  for (const item of items) {
    for (const alert of (item.alerts ?? [])) {
      out.push({ ...alert, itemId: item.id, symbol: item.symbol, itemName: item.name });
    }
  }
  return out;
}

// Migracja starych alertów z Portfolio (localStorage) do watchlisty.
// Uruchamiana raz per użytkownik — po sukcesie flag ustawiony, nie próbuje ponownie.
export async function migratePortfolioAlertsOnce() {
  if (localStorage.getItem(MIGRATION_KEY) === '1') return { migrated: 0, skipped: true };
  const token = localStorage.getItem('myfund_auth_token');
  if (!token) return { migrated: 0, skipped: true };

  let oldAlerts;
  try { oldAlerts = JSON.parse(localStorage.getItem(OLD_PORTFOLIO_ALERTS_KEY) || '[]'); }
  catch { oldAlerts = []; }

  if (!Array.isArray(oldAlerts) || oldAlerts.length === 0) {
    // Nic do migracji — po prostu ustaw flag, żebyśmy więcej nie próbowali.
    localStorage.removeItem(OLD_PORTFOLIO_ALERTS_KEY);
    localStorage.setItem(MIGRATION_KEY, '1');
    return { migrated: 0, skipped: false };
  }

  let items;
  try { items = await apiLoadWatchlist(); if (!Array.isArray(items)) items = []; }
  catch { return { migrated: 0, skipped: true }; } // spróbujemy przy następnym mount

  let migrated = 0;
  for (const old of oldAlerts) {
    if (!old?.symbol || !old?.target || !old?.direction) continue;
    const alert = {
      id: genAlertId(),
      kind: 'price',
      type: old.direction === 'above' ? 'above' : 'below',
      targetPrice: Number(old.target),
      mode: 'once',
      triggered: false,
      migratedFromPortfolio: true,
    };
    items = addAlertToItems(items, old.symbol, alert);
    migrated++;
  }

  try {
    await apiSaveWatchlist(items);
    saveWatchlistLocal(items);
    localStorage.removeItem(OLD_PORTFOLIO_ALERTS_KEY);
    localStorage.setItem(MIGRATION_KEY, '1');
    return { migrated, skipped: false };
  } catch {
    return { migrated: 0, skipped: true };
  }
}
