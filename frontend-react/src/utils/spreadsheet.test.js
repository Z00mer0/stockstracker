import { describe, it, expect } from 'vitest';
import { excelSerialToISO, repairXlsx } from './spreadsheet.js';

describe('excelSerialToISO', () => {
  // Punkty odniesienia sprawdzone wobec tego, co pokazuje sam Excel.
  it.each([
    [1, '1900-01-01'],
    [59, '1900-02-28'],
    [61, '1900-03-01'],
    [25569, '1970-01-01'],
    [44927, '2023-01-01'],
    [45658, '2025-01-01'],
    [46023, '2026-01-01'],
  ])('numer %i to %s', (serial, iso) => {
    expect(excelSerialToISO(serial)).toBe(iso);
  });

  it('ułamek (data z godziną) obcina się do dnia', () => {
    // XTB zapisuje datę z czasem jako część ułamkową numeru.
    expect(excelSerialToISO(45658.2)).toBe('2025-01-01');
  });

  it('odrzuca wartości, które nie są liczbą', () => {
    expect(excelSerialToISO(NaN)).toBeNull();
    expect(excelSerialToISO(Infinity)).toBeNull();
    expect(excelSerialToISO(undefined)).toBeNull();
    expect(excelSerialToISO('45658')).toBeNull();
  });
});

// Odczyt arkuszy testowany jest end-to-end w przeglądarce (scratchpad:
// test_import_e2e.mjs) — read-excel-file ma osobne wejścia dla Node i dla
// przeglądarki, więc test nodowy nie mówiłby nic o realnej ścieżce.

describe('repairXlsx — eksport XTB (<dimension ref="A1"/>, puste inlineStr)', () => {
  it('usuwa zakres z arkuszy, reszta pliku bez zmian', async () => {
    const { zipSync, unzipSync, strToU8, strFromU8 } = await import('fflate');
    const sheet = '<worksheet><dimension ref="A1"/><sheetData><row r="1"><c r="A1"/></row></sheetData></worksheet>';
    const zip = zipSync({ 'xl/worksheets/sheet1.xml': strToU8(sheet), 'xl/workbook.xml': strToU8('<workbook><dimension ref="A1"/></workbook>') });
    const out = unzipSync(await repairXlsx(zip));
    expect(strFromU8(out['xl/worksheets/sheet1.xml'])).toBe('<worksheet><sheetData><row r="1"><c r="A1"/></row></sheetData></worksheet>');
    expect(strFromU8(out['xl/workbook.xml'])).toContain('<dimension ref="A1"/>');
  });

  it('pusta komórka inlineStr bez treści → zwykła pusta komórka', async () => {
    const { zipSync, unzipSync, strToU8, strFromU8 } = await import('fflate');
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>X</t></is></c><c r="B1" t="inlineStr"/><c r="C1" s="2" t="inlineStr" /></row></sheetData></worksheet>';
    const out = unzipSync(await repairXlsx(zipSync({ 'xl/worksheets/sheet1.xml': strToU8(sheet) })));
    expect(strFromU8(out['xl/worksheets/sheet1.xml'])).toBe('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>X</t></is></c><c r="B1"/><c r="C1" s="2"/></row></sheetData></worksheet>');
  });

  it('plik bez znacznika zwracany bez przepakowania', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const zip = zipSync({ 'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData/></worksheet>') });
    expect(await repairXlsx(zip)).toBe(zip);
  });
});
