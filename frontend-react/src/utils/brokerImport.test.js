import { describe, it, expect } from 'vitest';
import { brokerCurrency, parseBrokerRows, parseBrokerCsv, computePortfolioPreview } from './brokerImport.js';

const strip = txs => txs.map(({ id: _id, ...rest }) => rest);

describe('brokerCurrency', () => {
  it('waluta po sufiksie XTB', () => {
    expect(brokerCurrency('PKN.PL')).toBe('PLN');
    expect(brokerCurrency('CDR.WA')).toBe('PLN');
    expect(brokerCurrency('AAPL.US')).toBe('USD');
    expect(brokerCurrency('VOW3.DE')).toBe('EUR');
    expect(brokerCurrency('BP.UK')).toBe('GBP');
  });
});

describe('Closed Positions', () => {
  const rows = [
    ['XTB'], ['Closed positions'], [], [],
    ['Position ID', 'Ticker', 'Type', 'Volume', 'Open time (UTC)', 'Open price', 'Close time (UTC)', 'Close price', 'Profit/Loss'],
    ['11', 'AAPL.US', 'BUY', '2', '15/01/2024 10:00', '180', '20/06/2024 15:00', '210', '60'],
    ['12', 'VOW3.DE', 'BUY', '3', '2024-02-01 09:00', '100', '', '', '0'],
    ['13', '', 'BUY', '1', '', '', '', '', ''],
  ];
  const r = parseBrokerRows(rows);

  it('zamknięta pozycja = BUY po cenie otwarcia + SELL po cenie zamknięcia', () => {
    expect(r.type).toBe('closed_positions');
    expect(strip(r.transactions.slice(0, 2))).toEqual([
      { type: 'BUY', symbol: 'AAPL', qty: 2, price: 180, currency: 'USD', date: '2024-01-15', note: 'Import brokera', brokerPositionId: '11', fromClosedPosition: true },
      { type: 'SELL', symbol: 'AAPL', qty: 2, price: 210, currency: 'USD', date: '2024-06-20', note: 'Import brokera | P&L: +60.00 USD', brokerPositionId: '11_close', fromClosedPosition: true },
    ]);
  });

  it('spółka z Niemiec w EUR (wcześniej USD), bez zamknięcia — tylko BUY', () => {
    expect(strip(r.transactions.slice(2))).toEqual([
      { type: 'BUY', symbol: 'VOW3.DE', qty: 3, price: 100, currency: 'EUR', date: '2024-02-01', note: 'Import brokera', brokerPositionId: '12', fromClosedPosition: true },
    ]);
  });

  it('wiersz bez danych trafia do błędów z numerem wiersza', () => {
    expect(r.errors).toEqual([8]);
  });
});

describe('Cash Operations (CSV)', () => {
  const csv = [
    'XTB', 'Cash operations', '', '',
    'ID;Type;Time;Comment;Symbol;Amount',
    '1;Deposit;01.03.2024 10:00;Wpłata;;"5000"',
    '2;Stock purchase;05.03.2024 10:00;OPEN BUY 3 @ 102.20;;-306.6',
    '3;Stock sale;06.03.2024 10:00;CLOSE BUY 2/3 @ 110.00;;220',
    '4;Dividend;07.03.2024 10:00;PKN.PL USD 1.20/ SHR;;4.5',
  ].join('\n');
  const r = parseBrokerCsv(csv);

  it('rozpoznaje typy, ilość i cenę z komentarza', () => {
    expect(r.type).toBe('cash_operations');
    expect(r.transactions.map(t => [t.type, t.qty, t.price])).toEqual([
      ['CASH', null, 5000],
      ['BUY', 3, 102.2],
      ['SELL', 2, 110],
      ['DIV', null, 4.5],
    ]);
  });

  it('data DD.MM.YYYY → ISO', () => {
    expect(r.transactions.map(t => t.date)).toEqual(['2024-03-01', '2024-03-05', '2024-03-06', '2024-03-07']);
  });

  it('wpłata w walucie rachunku (wcześniej zawsze USD)', () => {
    const pln = parseBrokerCsv(csv, 'PLN');
    expect(pln.transactions[0]).toMatchObject({ type: 'CASH', price: 5000, currency: 'PLN' });
    // zakup i dywidenda dalej po sufiksie symbolu
    expect(pln.transactions[3].currency).toBe('PLN');
  });

  it('kolumna „Symbol" i komentarz bez symbolu', () => {
    const r2 = parseBrokerCsv([
      'XTB', 'Cash operations', '', '',
      'ID;Type;Time;Comment;Symbol;Amount',
      '2;Stock purchase;05.03.2024 10:00;OPEN BUY 3 @ 102.20;NVDA.US;-306.6',
      '3;Stock purchase;05.03.2024 10:00;OPEN BUY 1 @ 50;;-50',
    ].join('\n'));
    // wcześniej: symbol „OPEN" zgadnięty z komentarza
    expect(r2.transactions.map(t => t.symbol)).toEqual(['NVDA', 'UNKNOWN']);
  });

  it('dywidenda: symbol z komentarza, waluta z sufiksu', () => {
    const div = r.transactions[3];
    expect(div.symbol).toBe('PKN.WA');
    expect(div.currency).toBe('PLN');
  });
});

describe('computePortfolioPreview', () => {
  it('dokupienie uśrednia, sprzedaż zmniejsza, gotówka liczona z qty·price', () => {
    const holdings = [{ symbol: 'AAPL', qty: 10, avgPrice: 100, currency: 'USD' }];
    const txs = [
      { type: 'CASH', price: 1000, currency: 'USD', date: '2024-01-01' },
      { type: 'BUY', symbol: 'AAPL', qty: 10, price: 130, currency: 'USD', date: '2024-01-02' },
      { type: 'SELL', symbol: 'AAPL', qty: 5, price: 150, currency: 'USD', date: '2024-01-03' },
      { type: 'BUY', symbol: 'MSFT', qty: 1, price: 400, currency: 'USD', date: '2024-01-04' },
      { type: 'DIV', price: 7, currency: 'USD', date: '2024-01-05' },
    ];
    const p = computePortfolioPreview(txs, holdings, { USD: 100 });
    // AAPL: (10·100 + 10·130)/20 = 115, potem 20 − 5 = 15 szt.
    expect(p.modified).toEqual([{ symbol: 'AAPL', qty: 15, avgPrice: 115, currency: 'USD', oldQty: 10 }]);
    expect(p.added).toEqual([{ symbol: 'MSFT', qty: 1, avgPrice: 400, currency: 'USD' }]);
    // 100 + 1000 − 1300 + 750 − 400 + 7 = 157 → +57
    expect(p.cashAdded.USD).toBeCloseTo(57, 8);
  });

  it('pozycje z Closed Positions nie ruszają gotówki ani istniejącej średniej', () => {
    const holdings = [{ symbol: 'AAPL', qty: 10, avgPrice: 100, currency: 'USD' }];
    const txs = [{ type: 'BUY', symbol: 'AAPL', qty: 2, price: 180, currency: 'USD', date: '2024-01-15', fromClosedPosition: true }];
    const p = computePortfolioPreview(txs, holdings, { USD: 100 });
    expect(p.modified).toEqual([]);
    expect(p.cashAdded).toEqual({});
  });
});
