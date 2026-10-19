// Import transakcji z pliku CSV (strona Transakcje) — z dowolnego biura.
//
// Kolumny dopasowujemy po nagłówkach (nasz eksport po polsku i angielsku,
// typowe nazwy z wyciągów biur, m.in. Trading 212 i Revolut), a okno importu
// pozwala każde dopasowanie poprawić ręcznie. Liczby „1 234,56", „$12.30",
// „USD 12.30" i daty „17.10.2026", „2026-10-17 14:30" są rozpoznawane.

export const CSV_FIELDS = ['date', 'type', 'symbol', 'isin', 'qty', 'price', 'total', 'currency', 'totalCurrency', 'fee', 'tax', 'note'];

// Nagłówek (małe litery, bez cudzysłowów i podwójnych spacji) → pole.
const SYNONYMS = {
  date: ['data', 'date', 'time', 'czas', 'data transakcji', 'data operacji', 'trade date', 'date/time', 'datetime'],
  type: ['typ', 'type', 'action', 'rodzaj', 'operacja', 'transaction type', 'k/s', 'kierunek'],
  symbol: ['symbol', 'ticker', 'instrument', 'walor', 'papier'],
  isin: ['isin'],
  qty: ['ilość', 'ilosc', 'qty', 'quantity', 'no. of shares', 'shares', 'liczba', 'liczba akcji', 'wolumen'],
  price: ['cena', 'price', 'price / share', 'price per share', 'kurs', 'cena jednostkowa'],
  total: ['total', 'total amount', 'wartość', 'wartosc', 'amount', 'kwota', 'value'],
  currency: ['waluta', 'currency', 'currency (price / share)', 'waluta transakcji'],
  totalCurrency: ['currency (total)'],
  fee: ['prowizja', 'fee', 'fees', 'commission', 'charge amount', 'opłata', 'oplata'],
  tax: ['withholding tax', 'podatek', 'tax', 'podatek u źródła', 'podatek pobrany', 'tax withheld'],
  note: ['uwaga', 'notatka', 'note', 'notes', 'komentarz', 'comment', 'opis'],
};
const HEADER_FIELD = Object.fromEntries(Object.entries(SYNONYMS).flatMap(([f, names]) => names.map(n => [n, f])));
const normHeader = h => String(h ?? '').replace(/['"]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

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
  return result.map(c => c.trim());
}

// { headers, rows } — separator ; , albo tabulator, wybierany po nagłówku.
export function readCsv(text) {
  const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };
  const count = d => splitLine(lines[0], d).length;
  const delimiter = [';', '\t', ','].reduce((best, d) => (count(d) > count(best) ? d : best), ',');
  return { headers: splitLine(lines[0], delimiter), rows: lines.slice(1).map(l => splitLine(l, delimiter)) };
}

// { pole: indeks kolumny | null } — pierwsza pasująca kolumna wygrywa.
export function guessMapping(headers) {
  const mapping = Object.fromEntries(CSV_FIELDS.map(f => [f, null]));
  headers.forEach((h, i) => {
    const f = HEADER_FIELD[normHeader(h)];
    if (f && mapping[f] == null) mapping[f] = i;
  });
  return mapping;
}

// „1 234,56", „1,234.56", „$12.30", „USD 12.30", „-5" → liczba; NaN, gdy brak.
export function parseNumber(raw) {
  let s = String(raw ?? '').replace(/[^\d,.-]/g, '');
  if (!/\d/.test(s)) return NaN;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  return parseFloat(s);
}

// Data → YYYY-MM-DD. Zapis z kropkami/ukośnikami czytamy jako dzień-miesiąc
// (jak w polskich wyciągach), chyba że druga liczba nie może być miesiącem.
export function parseDate(raw) {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    let [d, mo] = [+m[1], +m[2]];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return '';
}

// Opis operacji z wyciągu → typ; CASH_IN/CASH_OUT to wpłata/wypłata.
// null — operacja, której nie importujemy (opłaty, odsetki, przewalutowania).
export function mapType(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'BUY';
  if (/withdraw|wypłat|wyplat|cash out/.test(s)) return 'CASH_OUT';
  if (/deposit|top-?up|wpłat|wplat|cash in/.test(s)) return 'CASH_IN';
  if (/divid|dywid|^div$/.test(s)) return 'DIV';
  if (/sell|sprzeda|^s$/.test(s)) return 'SELL';
  if (/buy|kupn|zakup|purchase|^k$|^b$/.test(s)) return 'BUY';
  if (s === 'cash' || s === 'gotówka' || s === 'gotowka') return 'CASH';
  return null;
}

// Wiersze → transakcje. Zwraca { valid, skippedCount }; pominięte to wiersze
// bez symbolu (poza gotówką), bez ceny/kwoty albo z operacją spoza listy.
export function rowsToTransactions(rows, mapping, makeId = () => Math.random().toString(36).slice(2, 10)) {
  const cell = (row, f) => (mapping[f] == null ? '' : row[mapping[f]] ?? '');
  const valid = [];
  let skippedCount = 0;
  for (const row of rows) {
    let type = mapType(cell(row, 'type'));
    let qty = parseNumber(cell(row, 'qty'));
    const total = parseNumber(cell(row, 'total'));
    let price = parseNumber(cell(row, 'price'));
    // Bez kolumny typu ujemna ilość to sprzedaż.
    if (mapping.type == null && qty < 0) type = 'SELL';
    if (!type) { skippedCount++; continue; }
    qty = Math.abs(qty);

    let symbol = cell(row, 'symbol').toUpperCase();
    const isin = cell(row, 'isin').toUpperCase();
    // Spółki z GPW bywają w wyciągach bez sufiksu giełdy (rozpoznajemy po ISIN).
    if (symbol && !symbol.includes('.') && isin.startsWith('PL')) symbol += '.WA';
    const currency = (cell(row, 'currency') || cell(row, 'totalCurrency') || (isin.startsWith('PL') ? 'PLN' : '') || 'PLN').toUpperCase();

    const isCash = type === 'CASH' || type === 'CASH_IN' || type === 'CASH_OUT';
    if (isCash || type === 'DIV') {
      if (isNaN(price) || (type === 'DIV' && isNaN(qty) && !isNaN(total))) price = total;
      if (type === 'DIV' && mapping.price == null) qty = NaN;
    } else if (isNaN(price) && !isNaN(total) && qty > 0) {
      price = Math.abs(total) / qty;
    }
    if (isNaN(price) || (!symbol && !isCash)) { skippedCount++; continue; }

    if (type === 'CASH_IN') price = Math.abs(price);
    else if (type === 'CASH_OUT') price = -Math.abs(price);
    else if (type !== 'CASH') price = Math.abs(price);

    const fee = Math.abs(parseNumber(cell(row, 'fee')));
    const tax = Math.abs(parseNumber(cell(row, 'tax')));
    valid.push({
      id: makeId(),
      date: parseDate(cell(row, 'date')) || cell(row, 'date'),
      type: isCash ? 'CASH' : type,
      symbol,
      qty: isCash || isNaN(qty) || qty === 0 ? null : qty,
      price,
      currency,
      note: cell(row, 'note'),
      ...(!isCash && type !== 'DIV' && fee > 0 ? { fee } : {}),
      ...(type === 'DIV' && tax > 0 ? { tax } : {}),
    });
  }
  return { valid, skippedCount };
}

export function parseTransactionsCsv(text, makeId) {
  const { headers, rows } = readCsv(text);
  return rowsToTransactions(rows, guessMapping(headers), makeId);
}
