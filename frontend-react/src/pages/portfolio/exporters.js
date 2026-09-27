// Eksport pozycji, transakcji i historii wartości do CSV / Excel.
// Wcześniej trzy prawie identyczne bloki pobierania CSV siedziały w
// Portfolio.jsx — tu jest jeden, a wiersze budują osobne funkcje.

const stamp = () => new Date().toISOString().slice(0, 10);

function downloadCsv(headers, rows, fileName) {
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  // BOM na początku, żeby Excel otworzył polskie znaki poprawnie.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

// Ładowane dopiero przy kliknięciu „eksportuj" — samo wejście do portfela
// nie ma po co ciągnąć generatora arkuszy.
async function downloadXlsx(headers, rows, sheetName, fileName) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  // Biblioteka oczekuje komórek jako obiektów z jawnym typem. Nagłówki idą
  // pogrubione, a wartości rozdzielamy na liczby i tekst — bez tego liczby
  // wylądowałyby w arkuszu jako napisy i nie dałoby się na nich liczyć.
  const data = [
    headers.map(h => ({ value: String(h), fontWeight: 'bold', type: String })),
    ...rows.map(r => r.map(cell =>
      typeof cell === 'number' && Number.isFinite(cell)
        ? { value: cell, type: Number }
        : { value: cell === '' || cell == null ? null : String(cell), type: String }
    )),
  ];
  await writeXlsxFile(data, { fileName, sheet: sheetName });
}

function save(format, headers, rows, sheetName, baseName) {
  const name = `${baseName}_${stamp()}`;
  return format === 'xlsx'
    ? downloadXlsx(headers, rows, sheetName, `${name}.xlsx`)
    : downloadCsv(headers, rows, `${name}.csv`);
}

// W CSV liczby jako tekst z dwoma miejscami, w Excelu jako liczby.
const num2 = (v, xlsx) => (v == null ? '' : xlsx ? parseFloat(v.toFixed(2)) : v.toFixed(2));

export function exportPositions(positions, t, format) {
  const xlsx = format === 'xlsx';
  const headers = [t('col_symbol'), t('col_qty'), t('col_avg_price'), t('col_currency'), t('col_price'), t('col_cost_pln'), t('col_value_pln'), t('col_pl_pln'), t('col_pl_pct'), t('col_daily_chg')];
  const rows = positions.map(p => [
    p.symbol, p.qty ?? '', p.avgPrice ?? '', p.currency ?? '', p.price ?? '',
    num2(p.costPLN, xlsx), num2(p.valuePLN, xlsx), num2(p.plPLN, xlsx),
    p.costPLN > 0 && p.plPLN != null ? num2((p.plPLN / p.costPLN) * 100, xlsx) : '',
    num2(p.dailyChg, xlsx),
  ]);
  return save(format, headers, rows, 'Portfel', 'portfel');
}

export function exportTransactions(transactions, t, format) {
  const headers = [t('col_date'), t('col_type'), 'Symbol', t('col_qty'), t('col_price'), t('col_currency'), t('col_note')];
  const rows = transactions.map(tx => [
    tx.date ?? '', tx.type ?? '', tx.symbol ?? '',
    tx.qty != null ? tx.qty : '', tx.price != null ? tx.price : '',
    tx.currency ?? '', tx.note ?? '',
  ]);
  return save(format, headers, rows, 'Transakcje', 'transakcje');
}

export function exportSnapshots(snapshots, t, format) {
  const headers = [t('col_date'), t('value_pln_header'), t('invested_pln_header')];
  const rows = snapshots
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => [s.date, s.total ?? '', s.invested ?? '']);
  return save(format, headers, rows, 'Historia', 'historia');
}
