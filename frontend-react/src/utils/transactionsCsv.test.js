import { describe, it, expect } from 'vitest';
import { readCsv, guessMapping, rowsToTransactions, parseTransactionsCsv, parseNumber, parseDate, mapType } from './transactionsCsv.js';

const id = () => 'x';
const strip = list => list.map(({ id: _id, ...rest }) => rest);

describe('parseNumber', () => {
  it('formaty polskie, angielskie i z walutą', () => {
    expect(parseNumber('1 234,56')).toBe(1234.56);
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseNumber('1.234,56')).toBe(1234.56);
    expect(parseNumber('$12.30')).toBe(12.3);
    expect(parseNumber('USD 12.30')).toBe(12.3);
    expect(parseNumber('-5')).toBe(-5);
    expect(parseNumber('132,5')).toBe(132.5);
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber('abc')).toBeNaN();
  });
});

describe('parseDate', () => {
  it('ISO, z czasem, dzień-miesiąc i miesiąc-dzień, gdy inaczej się nie da', () => {
    expect(parseDate('2026-10-17')).toBe('2026-10-17');
    expect(parseDate('2026-10-17 14:30:00')).toBe('2026-10-17');
    expect(parseDate('2026-10-17T14:30:00.123Z')).toBe('2026-10-17');
    expect(parseDate('17.10.2026')).toBe('2026-10-17');
    expect(parseDate('7/3/2026')).toBe('2026-03-07');
    expect(parseDate('10/17/2026')).toBe('2026-10-17');
    expect(parseDate('wczoraj')).toBe('');
  });
});

describe('mapType', () => {
  it('opisy operacji z różnych biur', () => {
    expect(mapType('Market buy')).toBe('BUY');
    expect(mapType('BUY - MARKET')).toBe('BUY');
    expect(mapType('Kupno')).toBe('BUY');
    expect(mapType('K')).toBe('BUY');
    expect(mapType('Limit sell')).toBe('SELL');
    expect(mapType('Sprzedaż')).toBe('SELL');
    expect(mapType('Dividend (Ordinary)')).toBe('DIV');
    expect(mapType('Dywidenda')).toBe('DIV');
    expect(mapType('Deposit')).toBe('CASH_IN');
    expect(mapType('CASH TOP-UP')).toBe('CASH_IN');
    expect(mapType('Wypłata')).toBe('CASH_OUT');
    expect(mapType('CASH WITHDRAWAL')).toBe('CASH_OUT');
    expect(mapType('CUSTODY FEE')).toBeNull();
    expect(mapType('')).toBe('BUY');
  });
});

describe('import z wyciągów', () => {
  it('układ Trading 212', () => {
    const csv = [
      'Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Total,Currency (Total),Withholding tax,Currency (Withholding tax),Charge amount,Notes,ID',
      'Deposit,2026-01-02 09:00:00,,,,,,,,5000.00,PLN,,,,,d1',
      'Market buy,2026-01-03 15:31:12,US0378331005,AAPL,Apple,2.5,185.20,USD,4.01,1856.70,PLN,,,1.20,,o1',
      'Market buy,2026-01-04 09:05:00,PLCDPRO00015,CDR,CD Projekt,10,132.50,PLN,1,1325.00,PLN,,,,,o2',
      'Dividend (Ordinary),2026-02-15 10:00:00,US0378331005,AAPL,Apple,2.5,0.25,USD,4.0,2.13,PLN,0.09,USD,,,v1',
      'Market sell,2026-03-01 16:00:00,US0378331005,AAPL,Apple,1,200.00,USD,4.0,800,PLN,,,,,o3',
      'Withdrawal,2026-03-02 10:00:00,,,,,,,,-300.00,PLN,,,,,w1',
      'Interest on cash,2026-03-31 10:00:00,,,,,,,,1.10,PLN,,,,,i1',
    ].join('\n');
    const { valid, skippedCount } = parseTransactionsCsv(csv, id);
    expect(skippedCount).toBe(1);
    expect(strip(valid)).toEqual([
      { date: '2026-01-02', type: 'CASH', symbol: '', qty: null, price: 5000, currency: 'PLN', note: '' },
      { date: '2026-01-03', type: 'BUY', symbol: 'AAPL', qty: 2.5, price: 185.2, currency: 'USD', note: '', fee: 1.2 },
      { date: '2026-01-04', type: 'BUY', symbol: 'CDR.WA', qty: 10, price: 132.5, currency: 'PLN', note: '' },
      { date: '2026-02-15', type: 'DIV', symbol: 'AAPL', qty: 2.5, price: 0.25, currency: 'USD', note: '', tax: 0.09 },
      { date: '2026-03-01', type: 'SELL', symbol: 'AAPL', qty: 1, price: 200, currency: 'USD', note: '' },
      { date: '2026-03-02', type: 'CASH', symbol: '', qty: null, price: -300, currency: 'PLN', note: '' },
    ]);
  });

  it('układ Revolut', () => {
    const csv = [
      'Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate',
      '2026-01-05T14:32:10.123Z,,CASH TOP-UP,,,USD 1000,USD,1.0',
      '2026-01-05T14:35:00.000Z,MSFT,BUY - MARKET,2,USD 410.50,USD 821,USD,1.0',
      '2026-02-20T10:00:00.000Z,MSFT,DIVIDEND,,,USD 1.49,USD,1.0',
      '2026-02-28T10:00:00.000Z,,CUSTODY FEE,,,USD -0.12,USD,1.0',
    ].join('\n');
    const { valid, skippedCount } = parseTransactionsCsv(csv, id);
    expect(skippedCount).toBe(1);
    expect(strip(valid)).toEqual([
      { date: '2026-01-05', type: 'CASH', symbol: '', qty: null, price: 1000, currency: 'USD', note: '' },
      { date: '2026-01-05', type: 'BUY', symbol: 'MSFT', qty: 2, price: 410.5, currency: 'USD', note: '' },
      { date: '2026-02-20', type: 'DIV', symbol: 'MSFT', qty: null, price: 1.49, currency: 'USD', note: '' },
    ]);
  });

  it('polski wyciąg: średnik, przecinek dziesiętny, cena z wartości', () => {
    const csv = 'Data transakcji;Walor;K/S;Liczba;Wartość;Prowizja;Waluta\n17.10.2026;PKN.WA;K;10;"1 234,50";4,94;PLN\n18.10.2026;PKN.WA;S;4;520,00;3,90;PLN';
    expect(strip(parseTransactionsCsv(csv, id).valid)).toEqual([
      { date: '2026-10-17', type: 'BUY', symbol: 'PKN.WA', qty: 10, price: 123.45, currency: 'PLN', note: '', fee: 4.94 },
      { date: '2026-10-18', type: 'SELL', symbol: 'PKN.WA', qty: 4, price: 130, currency: 'PLN', note: '', fee: 3.9 },
    ]);
  });

  it('nierozpoznane kolumny da się dopasować ręcznie; bez typu ujemna ilość to sprzedaż', () => {
    const { headers, rows } = readCsv('Kiedy\tCo\tIle\tPo ile\n2026-05-01\tNVDA\t-3\t120');
    const mapping = guessMapping(headers);
    expect(mapping.symbol).toBeNull();
    const fixed = { ...mapping, date: 0, symbol: 1, qty: 2, price: 3 };
    expect(strip(rowsToTransactions(rows, fixed, id).valid)).toEqual([
      { date: '2026-05-01', type: 'SELL', symbol: 'NVDA', qty: 3, price: 120, currency: 'PLN', note: '' },
    ]);
  });
});
