// Import pozycji: CSV wklejony ręcznie albo arkusz „Open Position" z XTB.
// Wydzielone z CsvImportModal, żeby dało się je przetestować.
import { readSheets, excelSerialToISO } from './spreadsheet.js';
import { brokerCurrency, normalizeSymbol } from './brokerImport.js';

// „1 234,50" → 1234.5. Wcześniej spacja tysięcy ucinała liczbę do 1.
function num(str) {
  return parseFloat(String(str).replace(/[\s\u00a0]/g, '').replace(',', '.'));
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const firstField = lines[0].split(sep)[0].trim();
  const start = /^[a-zA-Z]/.test(firstField) && isNaN(parseFloat(lines[0].split(sep)[1])) ? 1 : 0;
  const results = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"(.+)"$/, '$1'));
    const [symbol, qtyStr, priceStr, currency, date] = cols;
    if (!symbol || !qtyStr || !priceStr) continue;
    const qty = num(qtyStr);
    const avgPrice = num(priceStr);
    if (isNaN(qty) || isNaN(avgPrice)) continue;
    results.push({
      id: Math.random().toString(36).slice(2, 10),
      symbol: symbol.toUpperCase().trim(), qty, avgPrice,
      currency: (currency || 'USD').toUpperCase().trim(),
      // Data w ISO także z „15.01.2024" — wcześniej zapisywana dosłownie.
      date: parseDate(date?.trim()) || new Date().toISOString().slice(0, 10),
      name: '',
    });
  }
  return results;
}

function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const iso = excelSerialToISO(val);
    if (iso) return iso;
  }
  const str = String(val);
  // "28/05/2026 11:03:24", "28.05.2026" albo "2026-05-28 11:03:24"
  const m = str.match(/(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return str.slice(0, 10).replace(/\//g, '-');
}

export async function parseXtbExcel(file) {
  const results = [];

  for (const { name: sheetName, rows } of await readSheets(file)) {
    // Only process "OPEN POSITION" sheets
    if (!sheetName.toUpperCase().includes('OPEN POSITION')) continue;

    // Find header row: the row containing "Symbol" and "Volume"
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map(c => String(c ?? '').toLowerCase().trim());
      if (row.includes('symbol') && row.includes('volume')) { headerIdx = i; break; }
    }
    if (headerIdx < 0) continue;

    const headers = rows[headerIdx].map(c => String(c ?? '').toLowerCase().trim());
    const col = (row, name) => {
      const idx = headers.indexOf(name.toLowerCase());
      return idx >= 0 ? String(row[idx] ?? '').trim() : '';
    };
    const colRaw = (row, name) => {
      const idx = headers.indexOf(name.toLowerCase());
      return idx >= 0 ? row[idx] : undefined;
    };

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.some(c => c != null && c !== '')) continue;

      const symbol    = col(row, 'symbol');
      const volume    = parseFloat(col(row, 'volume'));
      const openPrice = parseFloat(col(row, 'open price'));
      const openTime  = parseDate(colRaw(row, 'open time'));
      const type      = col(row, 'type').toUpperCase();

      if (!symbol || isNaN(volume) || isNaN(openPrice) || volume <= 0) continue;
      if (type && type !== 'BUY') continue; // skip shorts / non-stock rows

      const currency = brokerCurrency(symbol);
      const normalizedSymbol = normalizeSymbol(symbol.toUpperCase());

      results.push({
        id: Math.random().toString(36).slice(2, 10),
        symbol: normalizedSymbol,
        qty: volume,
        avgPrice: openPrice,
        currency,
        date: openTime || new Date().toISOString().slice(0, 10),
        name: '',
      });
    }
  }

  return results;
}

export function mergeBySymbol(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.symbol)) {
      map.set(r.symbol, { ...r });
    } else {
      const e = map.get(r.symbol);
      const totalQty = e.qty + r.qty;
      const avgPrice = (e.qty * e.avgPrice + r.qty * r.avgPrice) / totalQty;
      const ts1 = new Date(e.date).getTime();
      const ts2 = new Date(r.date).getTime();
      const avgDate = new Date((e.qty * ts1 + r.qty * ts2) / totalQty).toISOString().slice(0, 10);
      map.set(r.symbol, { ...e, qty: totalQty, avgPrice, date: avgDate });
    }
  }
  return Array.from(map.values());
}
