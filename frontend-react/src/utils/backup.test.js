import { describe, it, expect } from 'vitest';
import { buildBackup, parseBackup } from './backup.js';

const pf = [
  { id: 'a', name: 'IKE', currency: 'PLN', accountType: 'IKE' },
  { id: 'b', name: 'USA', currency: 'USD', accountType: '' },
];
const data = {
  a: { portfolio: { holdings: [{ symbol: 'PKO.WA', qty: 10, avgPrice: 50 }] }, transactions: [{ id: 't1', type: 'BUY' }], cash: { PLN: 100 }, snapshots: { '2026-01-01': 600 } },
  b: { portfolio: { holdings: [] }, transactions: [], cash: { USD: 5 }, otherAssets: [{ id: 'o', name: 'Złoto' }] },
};

describe('kopia zapasowa', () => {
  it('eksport → odtworzenie zachowuje każdy portfel osobno', () => {
    const file = JSON.parse(JSON.stringify(buildBackup(pf, data, new Date('2026-10-19T10:00:00Z'))));
    expect(file.version).toBe(2);
    const restored = parseBackup(file);
    expect(restored.map(p => [p.name, p.currency, p.accountType])).toEqual([['IKE', 'PLN', 'IKE'], ['USA', 'USD', '']]);
    expect(restored[0].data.cash).toEqual({ PLN: 100 });
    expect(restored[0].data.snapshots).toEqual({ '2026-01-01': 600 });
    expect(restored[1].data.otherAssets).toEqual([{ id: 'o', name: 'Złoto' }]);
  });

  it('stary eksport (widok „Wszystkie") → jeden łączny portfel bez znaczników', () => {
    const v1 = {
      exported_at: '2026-05-01T00:00:00Z', portfolios: pf,
      data: { portfolio: { holdings: [{ symbol: 'PKO.WA', qty: 10, _portfolioId: 'a', _portfolioName: 'IKE' }] }, transactions: [{ id: 't1', _portfolioId: 'a' }], cash: { PLN: 100, USD: 5 } },
    };
    const [one, ...rest] = parseBackup(v1, 'Z kopii');
    expect(rest).toEqual([]);
    expect(one.name).toBe('Z kopii');
    expect(one.currency).toBe('PLN');
    expect(one.data.portfolio.holdings).toEqual([{ symbol: 'PKO.WA', qty: 10 }]);
    expect(one.data.transactions).toEqual([{ id: 't1' }]);
  });

  it('plik, który nie jest kopią, jest odrzucany', () => {
    expect(() => parseBackup(null)).toThrow('not_backup');
    expect(() => parseBackup({ foo: 1 })).toThrow('not_backup');
    expect(() => parseBackup({ version: 2, portfolios: [{ name: 'x' }] })).toThrow('not_backup');
  });
});
