import { describe, it, expect, vi } from 'vitest';

// Arkusz „Open Positions” z eksportu xStation (układ jak w pliku z XTB):
// podsumowanie u góry, nagłówek z „Ticker”, wiersz zbiorczy na spółkę
// (bez typu) i pod nim każdy zakup osobno.
const ROWS = [
  ['Account number', 2507260], ['Open Positions'], ['Data as of report generated', '', '2026-11-02 21:49:50'],
  ['Product', 'Metric', 'Amount', 'Currency'],
  ['My Trades', 'Open position value', 15109.06, 'USD'],
  ['My Trades', 'Open position profit', -82.24, 'USD'],
  [],
  ['Note', 'Summary values and open positions are shown as of the report generation time'],
  ['Product', 'Instrument/Position', 'Ticker', 'Category', 'Type', 'Volume', 'Value', 'Current price', 'Open price', 'Open time (UTC)', 'Stop Loss', 'Take Profit', 'Net Profit %'],
  ['My Trades', 'Oracle', 'ORCL.US', 'STOCK', '', 3, 357.9, '', 130.23, '', '', '', -8.39],
  ['My Trades', '2877351497', 'ORCL.US', '', 'BUY', 2, 238.6, 119.3, 133.43, '2026-10-15 17:02:44', '', '', -10.59],
  ['My Trades', '2911227142', 'ORCL.US', '', 'BUY', 1, 119.3, 119.3, 118.99, '2026-11-02 20:46:33', '', '', 0.26],
  ['My Trades', 'Robinhood', 'HOOD.US', 'STOCK', '', 1, 83.93, '', 74.23, '', '', '', 13.07],
  ['My Trades', '2594478755', 'HOOD.US', '', 'BUY', 1, 83.93, 83.93, 74.23, '2026-05-26 16:06:53', '', '', 13.07],
];

vi.mock('./spreadsheet.js', () => ({
  readSheets: async () => [{ name: 'Open Positions', rows: ROWS }],
  excelSerialToISO: () => null,
}));

const { parseXtbExcel, mergeBySymbol } = await import('./holdingsImport.js');

describe('Open Positions z xStation', () => {
  it('kolumna „Ticker”, same zakupy — bez wiersza zbiorczego (wcześniej nic albo podwójnie)', async () => {
    const rows = await parseXtbExcel({});
    expect(rows.map(r => [r.symbol, r.qty, r.avgPrice, r.currency, r.date])).toEqual([
      ['ORCL', 2, 133.43, 'USD', '2026-10-15'],
      ['ORCL', 1, 118.99, 'USD', '2026-11-02'],
      ['HOOD', 1, 74.23, 'USD', '2026-05-26'],
    ]);
    const merged = mergeBySymbol(rows);
    expect(merged.find(r => r.symbol === 'ORCL').qty).toBe(3);
  });
});
