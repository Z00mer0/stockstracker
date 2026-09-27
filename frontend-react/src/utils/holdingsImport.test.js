import { describe, it, expect } from 'vitest';
import { parseCsv, mergeBySymbol } from './holdingsImport.js';

const strip = rows => rows.map(({ id: _id, name: _name, ...rest }) => rest);

describe('parseCsv', () => {
  it('nagłówek pomijany, przecinek i średnik, domyślna waluta USD', () => {
    expect(strip(parseCsv('Symbol,Ilość,Cena,Waluta,Data\nAAPL,10,185.50,USD,2024-01-15\ncdr.wa,100,88.2,pln,2024-03-01'))).toEqual([
      { symbol: 'AAPL', qty: 10, avgPrice: 185.5, currency: 'USD', date: '2024-01-15' },
      { symbol: 'CDR.WA', qty: 100, avgPrice: 88.2, currency: 'PLN', date: '2024-03-01' },
    ]);
    expect(strip(parseCsv('PKN.WA;5;"61,40";PLN;2024-05-02'))).toEqual([
      { symbol: 'PKN.WA', qty: 5, avgPrice: 61.4, currency: 'PLN', date: '2024-05-02' },
    ]);
  });

  it('spacja tysięcy w liczbie (wcześniej 1 234,50 → 1)', () => {
    expect(strip(parseCsv('LPP.WA;2;"12 345,50";PLN;2024-05-02'))[0].avgPrice).toBe(12345.5);
  });

  it('data DD.MM.YYYY i DD/MM/YYYY → ISO', () => {
    expect(parseCsv('AAPL;1;10;USD;15.01.2024\nMSFT;1;10;USD;16/01/2024\nKO;1;10;USD;2024-01-17').map(r => r.date))
      .toEqual(['2024-01-15', '2024-01-16', '2024-01-17']);
  });

  it('wiersz bez liczb pomijany', () => {
    expect(parseCsv('AAPL,abc,1,USD,2024-01-01')).toEqual([]);
  });
});

describe('mergeBySymbol', () => {
  it('średnia ważona ilością', () => {
    const rows = [
      { symbol: 'AAPL', qty: 10, avgPrice: 100, currency: 'USD', date: '2024-01-01' },
      { symbol: 'AAPL', qty: 30, avgPrice: 140, currency: 'USD', date: '2024-01-01' },
    ];
    // (10·100 + 30·140) / 40 = 130
    expect(mergeBySymbol(rows)).toEqual([{ symbol: 'AAPL', qty: 40, avgPrice: 130, currency: 'USD', date: '2024-01-01' }]);
  });
});
