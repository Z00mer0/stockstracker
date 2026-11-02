import { describe, it, expect } from 'vitest';
import { brokerCurrency, normalizeSymbol, parseBrokerRows, parseBrokerCsv, computePortfolioPreview, cashKind } from './brokerImport.js';
import { dedupeAgainstExisting } from './brokerDedupe.js';

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

describe('normalizeSymbol — sufiksy XTB → Yahoo', () => {
  it('kody krajów XTB na sufiksy giełd Yahoo', () => {
    expect(['CSPX.UK', 'MC.FR', 'ASML.NL', 'SAN.ES', 'ENI.IT', 'NOVOB.DK', 'NESN.CH', 'TXT.PL', 'AAPL.US', 'SPYL.DE', 'PKO.WA', 'CSPX.L'].map(normalizeSymbol))
      .toEqual(['CSPX.L', 'MC.PA', 'ASML.AS', 'SAN.MC', 'ENI.MI', 'NOVOB.CO', 'NESN.SW', 'TXT.WA', 'AAPL', 'SPYL.DE', 'PKO.WA', 'CSPX.L']);
  });

  it('waluty giełd spoza strefy euro (wcześniej DKK/SEK/NOK jako EUR)', () => {
    expect(['NOVOB.DK', 'VOLV-B.SE', 'EQNR.NO', 'NESN.CH', 'CEZ.CZ', 'MC.FR'].map(brokerCurrency))
      .toEqual(['DKK', 'SEK', 'NOK', 'CHF', 'CZK', 'EUR']);
  });

  it('ponowny import po zmianie: CSPX.UK z poprzedniego importu = CSPX.L (bez duplikatu)', () => {
    const old = [{ type: 'BUY', symbol: 'CSPX.UK', qty: 1, price: 550.3, date: '2024-05-14' }];
    const fresh = [{ type: 'BUY', symbol: 'CSPX.L', qty: 1, price: 550.3, date: '2024-05-14' }];
    expect(dedupeAgainstExisting(fresh, old)).toEqual([]);
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

// Wiersze w formacie eksportu xStation (CSV z „CASH OPERATION HISTORY",
// nagłówek w pierwszym wierszu) — rachunek w EUR.
describe('Cash Operations — eksport xStation', () => {
  const csv = [
    'ID;Type;Time;Symbol;Comment;Amount',
    '530692719;Stocks/ETF purchase;12.04.2024 13:01:45;SPYL.DE;OPEN BUY 34/42.5658 @ 11.7480;-399.43',
    '530691593;Deposit;12.04.2024 13:00:22;;JP_MORGAN deposit, JP_MORGAN provider transaction id=TXN-1, id=11083197;500',
    '419846716;Stocks/ETF purchase;25.07.2023 20:56:07;GOOGL.US;OPEN BUY 1 @ 122.34;-111.25',
    '524303821;Stocks/ETF sale;02.04.2024 11:42:37;ZAL.DE;CLOSE BUY 1 @ 26.280;26.28',
    '524222272;Stocks/ETF purchase;02.04.2024 10:21:47;ZAL.DE;OPEN BUY 1 @ 26.400;-26.4',
    '579262975;Dividend;12.07.2024 13:01:17;XRAY.US;XRAY.US USD 0.1600/ SHR;12.8',
    '579262976;Withholding tax;12.07.2024 13:01:17;XRAY.US;XRAY.US USD WHT 30%;-3.84',
    '579262886;Dividend;12.07.2024 13:01:17;XRAY.US;XRAY.US USD 0.1600/ SHR;4.8',
    '579262887;Withholding tax;12.07.2024 13:01:17;XRAY.US;XRAY.US USD WHT 30%;-1.44',
    '543857396;Free funds interests tax;07.05.2024 09:36:50;;Free-funds Interest Tax 2024-04;-2',
    '543604525;Free funds interests;07.05.2024 03:16:39;;Free-funds Interest 2024-04;15.17',
    '210658050;SEC fee;11.01.2024 16:16:01;AAPL.US;SEC fee;-0.01',
    '547615089;Stocks/ETF purchase;14.05.2024 17:21:10;FLOA.UK;OPEN BUY 16/16.7399 @ 5.9140;-94.62',
    '547615089;Stocks/ETF purchase;14.05.2024 17:21:10;FLOA.UK;OPEN BUY 16/16.7399 @ 5.9140;-94.62',
    '419846717;Ações/ETF compra;25.07.2023 20:56:07;GOOGL.US;OPEN BUY 1 @ 122.34;-111.25',
  ].join('\n');
  const r = parseBrokerCsv(csv, 'EUR');
  const byNote = n => r.transactions.filter(t => t.note.startsWith(n));

  it('nagłówek w pierwszym wierszu — arkusz rozpoznany (wcześniej „za mało wierszy")', () => {
    expect(r.type).toBe('cash_operations');
  });

  it('„Stocks/ETF purchase/sale" to kupno i sprzedaż (wcześniej pomijane)', () => {
    expect(r.transactions.filter(t => t.type === 'BUY').map(t => [t.symbol, t.qty, t.price, t.currency]))
      .toEqual([['GOOGL', 1, 122.34, 'USD'], ['ZAL.DE', 1, 26.4, 'EUR'], ['SPYL.DE', 34, 11.748, 'EUR'], ['FLOA.L', 16, 5.914, 'GBP']]);
    expect(r.transactions.filter(t => t.type === 'SELL').map(t => [t.symbol, t.qty, t.price])).toEqual([['ZAL.DE', 1, 26.28]]);
  });

  it('gotówka z kolumny Amount w walucie rachunku, cena w walucie instrumentu', () => {
    const googl = r.transactions.find(t => t.symbol === 'GOOGL');
    expect(googl).toMatchObject({ price: 122.34, currency: 'USD', cashAmount: -111.25, cashCurrency: 'EUR' });
  });

  it('podatek u źródła dopięty do swojej dywidendy, dywidenda w walucie rachunku', () => {
    expect(r.transactions.filter(t => t.type === 'DIV').map(t => [t.symbol, t.price, t.tax, t.currency]))
      .toEqual([['XRAY', 12.8, 3.84, 'EUR'], ['XRAY', 4.8, 1.44, 'EUR']]);
  });

  it('odsetki, podatek od odsetek i opłaty — gotówka z rodzajem, nie wpłata', () => {
    expect(byNote('Free-funds Interest 2024').map(t => [t.type, t.kind, t.price])).toEqual([['CASH', 'interest', 15.17]]);
    expect(byNote('Free-funds Interest Tax').map(t => [t.kind, t.price])).toEqual([['tax', -2]]);
    expect(byNote('SEC fee').map(t => [t.kind, t.price])).toEqual([['fee', -0.01]]);
    expect(byNote('JP_MORGAN').map(t => [t.type, t.kind, t.price, t.currency])).toEqual([['CASH', undefined, 500, 'EUR']]);
  });

  it('powtórzony wiersz (to samo ID) liczony raz, nieznany typ zgłoszony', () => {
    expect(r.transactions.filter(t => t.symbol === 'FLOA.L')).toHaveLength(1);
    expect(r.skipped).toEqual([{ type: 'ações/etf compra', n: 1 }]);
  });

  it('chronologicznie z godziną: kupno i sprzedaż z jednego dnia nie zostawiają pozycji', () => {
    const p = computePortfolioPreview(r.transactions, [], {});
    expect(p.added.map(x => x.symbol)).not.toContain('ZAL.DE');
  });

  it('podgląd: zakup zdejmuje euro (Amount), dywidenda wpływa po podatku', () => {
    const p = computePortfolioPreview(r.transactions, [], {});
    // −399.43 + 500 − 111.25 + 26.28 + (12.8 − 3.84) + (4.8 − 1.44) − 2 + 15.17 − 0.01 − 94.62
    expect(p.cashRemoved.EUR).toBeCloseTo(-(-399.43 + 500 - 111.25 + 26.28 - 26.4 + 8.96 + 3.36 - 2 + 15.17 - 0.01 - 94.62), 6);
    expect(p.cashAdded).toEqual({});
    expect(p.cashRemoved.USD).toBeUndefined();
  });
});

describe('cashKind', () => {
  it('starsze i nowsze nazwy typów', () => {
    expect(cashKind('Stock purchase')).toBe('BUY');
    expect(cashKind('DIVIDENT')).toBe('DIV');
    expect(cashKind('Dividend', -0.05)).toBe('fee');
    expect(cashKind('Withholding tax')).toBe('wht');
    expect(cashKind('Transfer')).toBe('deposit');
    expect(cashKind('Profit/Loss (FX/CFD)')).toBe('cfd');
    expect(cashKind('Close trade')).toBeNull();
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
