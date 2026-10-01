// Import transakcji z pliku CSV (strona Transakcje).

// Nagłówki kolumn → pola. Obejmuje nazwy z naszego własnego eksportu w obu
// językach (utils/exporters: Data/Date, Typ/Type, Ilość/Qty, Cena/Price,
// Waluta/Currency, Notatka/Note) — wcześniej brakowało „Notatka", więc
// eksport i ponowny import po polsku gubił wszystkie notatki.
const COL_MAP = {
  data: 'date', date: 'date',
  typ: 'type', type: 'type',
  symbol: 'symbol', ticker: 'symbol',
  'ilość': 'qty', ilosc: 'qty', qty: 'qty', quantity: 'qty',
  cena: 'price', price: 'price',
  waluta: 'currency', currency: 'currency',
  uwaga: 'note', notatka: 'note', note: 'note',
};

function splitLine(line, delimiter) {
  const result = [];
  let inQuote = false;
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === delimiter && !inQuote) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// Zwraca { valid, skippedCount }. Wiersz bez liczbowej ceny albo bez symbolu
// (poza gotówką — CASH) jest pomijany i liczony. Separator ; albo , — wybierany po nagłówku.
export function parseTransactionsCsv(text, makeId = () => Math.random().toString(36).slice(2, 10)) {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return { valid: [], skippedCount: 0 };

  const delimiter = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const fieldMap = splitLine(lines[0], delimiter)
    .map(h => COL_MAP[h.trim().toLowerCase().replace(/['"]/g, '')] ?? null);

  const valid = [];
  let skippedCount = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], delimiter);
    const obj = {};
    fieldMap.forEach((field, idx) => {
      // splitLine już zdjął cudzysłowy; drugie zdejmowanie (było tu wcześniej)
      // ucinało prawdziwy cudzysłów na końcu notatki.
      if (field) obj[field] = (cols[idx] ?? '').trim();
    });
    const price = parseFloat(obj.price);
    const type = (obj.type || 'BUY').toUpperCase();
    // Wpłata gotówki nie ma symbolu — bez tego wyjątku plik wyeksportowany
    // z aplikacji nie wracał w całości (wiersze CASH były pomijane).
    if ((!obj.symbol && type !== 'CASH') || isNaN(price)) { skippedCount++; continue; }
    valid.push({
      id: makeId(),
      date: obj.date ?? '',
      type,
      symbol: (obj.symbol ?? '').toUpperCase(),
      qty: obj.qty !== '' && obj.qty != null ? parseFloat(obj.qty) || null : null,
      price,
      currency: obj.currency || 'PLN',
      note: obj.note ?? '',
    });
  }
  return { valid, skippedCount };
}
