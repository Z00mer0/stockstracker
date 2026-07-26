// Czytanie arkuszy .xlsx — zastępuje pakiet `xlsx` (SheetJS).
//
// Powód zmiany: SheetJS na npm jest nieutrzymywany i tkwi na 0.18.5 z dwiema
// otwartymi podatnościami (Prototype Pollution, ReDoS), na które `npm audit`
// nie ma żadnej poprawki. Łatane wydania wychodzą wyłącznie na własnym CDN
// producenta. Ponieważ parsujemy pliki wgrywane z zewnątrz, to jest dokładnie
// ta ścieżka, którą obie podatności atakują.
//
// `read-excel-file` czyta wyłącznie .xlsx — starego, binarnego .xls już nie.
// Import przyjmuje więc .xlsx i .csv (CSV i tak zawsze miał własny parser).

// Excel liczy dni od 1899-12-30. Dziwne przesunięcie bierze się stąd, że
// Excel uznaje rok 1900 za przestępny — data bazowa jest cofnięta o ten
// nieistniejący dzień. Zastępuje XLSX.SSF.parse_date_code.
export function excelSerialToISO(serial) {
  if (!Number.isFinite(serial)) return null;
  const n = Math.round(serial);
  // Numery do 59 to daty sprzed nieistniejącego 29 lutego 1900, więc baza jest
  // dla nich o dzień inna. Dla dat transakcji bez znaczenia, ale bez tego
  // numer 1 dawałby 1899-12-31 zamiast 1900-01-01.
  const base = n < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const d = new Date(base + n * 86400000);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Puste komórki jako '' — poprzednia biblioteka dostawała defval:'', a cały
// kod poniżej zakłada napisy. `null` przeciekłby do String(null) === 'null'.
function normalizeCell(v) {
  if (v == null) return '';
  // read-excel-file sam rozpoznaje komórki sformatowane jako data i oddaje
  // obiekt Date; SheetJS dawał surowy numer seryjny. parseDate w modalach
  // radzi sobie z jednym i drugim, ale ISO jest jednoznaczne.
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

// Zwraca [{ name, rows }] dla wszystkich arkuszy; rows to tablice tablic,
// dokładnie w kształcie, jaki dawało sheet_to_json({ header: 1 }).
export async function readSheets(file) {
  // Import dynamiczny: parser wchodzi do paczki dopiero przy realnym odczycie
  // pliku, a czysta konwersja dat daje się dzięki temu testować poza
  // przeglądarką (biblioteka ma osobne wejścia dla Node i przeglądarki).
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  // getSheets oddaje od razu komplet: [{ sheet, data }] — nazwa arkusza siedzi
  // w polu `sheet`, a `data` zawiera już wiersze. Osobny odczyt każdego arkusza
  // jest zbędny i w tej wersji zwraca inny kształt niż można by zakładać.
  const sheets = await readXlsxFile(file, { getSheets: true });
  return (Array.isArray(sheets) ? sheets : []).map(s => ({
    name: s.sheet ?? s.name ?? '',
    rows: (s.data ?? []).map(r => (Array.isArray(r) ? r.map(normalizeCell) : [])),
  }));
}
