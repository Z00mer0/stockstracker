// Kopia zapasowa danych (Ustawienia → Konto): eksport i odtworzenie.
//
// Wersja 2 zapisuje każdy portfel osobno. Wersja 1 (wcześniejszy eksport)
// zawierała tylko widok „Wszystkie" — pozycje, gotówka i snapshoty już
// zsumowane ze wszystkich portfeli — więc da się ją odtworzyć jedynie jako
// jeden łączny portfel.

export const BACKUP_VERSION = 2;

// Pola, które dokleja widok „Wszystkie" — nie należą do danych portfela.
function stripTags(list) {
  return (list ?? []).map(({ _portfolioId: _a, _portfolioName: _b, ...rest }) => rest);
}

function cleanData(data) {
  const d = data ?? {};
  return {
    ...d,
    portfolio: { ...(d.portfolio ?? {}), holdings: stripTags(d.portfolio?.holdings) },
    transactions: stripTags(d.transactions),
    ...(d.bonds ? { bonds: stripTags(d.bonds) } : {}),
  };
}

// portfolios: lista z /api/portfolios; dataById: { id: dane portfela }.
export function buildBackup(portfolios, dataById, now = new Date()) {
  return {
    app: 'MyFund / StocksTracker',
    version: BACKUP_VERSION,
    exported_at: now.toISOString(),
    portfolios: portfolios.map(p => ({
      name: p.name,
      currency: p.currency || 'PLN',
      accountType: p.accountType || '',
      data: cleanData(dataById[p.id]),
    })),
  };
}

// Plik kopii → [{ name, currency, accountType, data }] do utworzenia jako
// nowe portfele. Rzuca Error z kodem (message) przy pliku, który kopią nie jest.
export function parseBackup(json, combinedName = 'Portfel z kopii') {
  if (!json || typeof json !== 'object') throw new Error('not_backup');
  if (json.version === BACKUP_VERSION && Array.isArray(json.portfolios)) {
    const out = json.portfolios
      .filter(p => p && typeof p.name === 'string' && p.data && typeof p.data === 'object')
      .map(p => ({ name: p.name, currency: p.currency || 'PLN', accountType: p.accountType || '', data: cleanData(p.data) }));
    if (!out.length) throw new Error('not_backup');
    return out;
  }
  // Wersja 1: { portfolios: [...lista], data: widok „Wszystkie" }.
  if (json.data && typeof json.data === 'object' && Array.isArray(json.portfolios)) {
    const currencies = [...new Set(json.portfolios.map(p => p?.currency).filter(Boolean))];
    return [{ name: combinedName, currency: currencies.length === 1 ? currencies[0] : 'PLN', accountType: '', data: cleanData(json.data) }];
  }
  throw new Error('not_backup');
}
