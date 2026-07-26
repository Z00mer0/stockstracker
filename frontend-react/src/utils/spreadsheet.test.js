import { describe, it, expect } from 'vitest';
import { excelSerialToISO } from './spreadsheet.js';

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
