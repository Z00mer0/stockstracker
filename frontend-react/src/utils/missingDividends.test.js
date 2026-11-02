import { describe, it, expect } from 'vitest';
import { findMissingDividends, sharesHeldBefore } from './missingDividends.js';

const buy = (symbol, date, qty, extra = {}) => ({ type: 'BUY', symbol, date, qty, price: 10, ...extra });
const sell = (symbol, date, qty) => ({ type: 'SELL', symbol, date, qty, price: 12 });
const div = (symbol, date, price, qty = null) => ({ type: 'DIV', symbol, date, price, qty });
const TODAY = '2026-11-02';

describe('sharesHeldBefore', () => {
  it('liczy tylko akcje kupione przed dniem odcięcia', () => {
    const tx = [buy('PKO.WA', '2026-01-10', 100), buy('PKO.WA', '2026-06-10', 50), sell('PKO.WA', '2026-03-01', 30)];
    expect(sharesHeldBefore(tx, 'PKO.WA', '2026-06-10')).toBe(70);
    expect(sharesHeldBefore(tx, 'PKO.WA', '2026-06-11')).toBe(120);
  });

  it('snapshot ustawia stan od nowa', () => {
    const tx = [buy('X', '2025-01-01', 10), buy('X', '2025-06-01', 40, { fromSnapshot: true })];
    expect(sharesHeldBefore(tx, 'X', '2025-07-01')).toBe(40);
  });
});

describe('findMissingDividends', () => {
  const history = { 'PKO.WA': [{ date: '2026-06-20', amount: 5.47 }, { date: '2025-07-01', amount: 5.55 }] };

  it('dywidenda bez zapisu, gdy akcje były w portfelu', () => {
    const tx = [buy('PKO.WA', '2026-01-10', 100)];
    expect(findMissingDividends(tx, history, { today: TODAY })).toEqual([
      { symbol: 'PKO.WA', exDate: '2026-06-20', perShare: 5.47, qty: 100, gross: 547 },
    ]);
  });

  it('zapis ręczny (data odcięcia) albo z brokera (data wypłaty) zamyka pozycję', () => {
    const tx = [buy('PKO.WA', '2025-01-10', 100), div('PKO.WA', '2026-06-20', 5.47, 100), div('PKO.WA', '2025-08-20', 555)];
    expect(findMissingDividends(tx, history, { today: TODAY })).toEqual([]);
  });

  it('jeden zapis nie zamyka dwóch odcięć', () => {
    const h = { MSFT: [{ date: '2026-02-19', amount: 0.91 }, { date: '2026-05-21', amount: 0.91 }] };
    const tx = [buy('MSFT', '2025-12-01', 10), div('MSFT', '2026-03-12', 9.1)];
    expect(findMissingDividends(tx, h, { today: TODAY }).map(m => m.exDate)).toEqual(['2026-05-21']);
  });

  it('pomija odrzucone, przyszłe i te sprzed zakupu', () => {
    const h = { 'PKO.WA': [...history['PKO.WA'], { date: '2026-12-01', amount: 2 }] };
    const tx = [buy('PKO.WA', '2026-01-10', 100)];
    expect(findMissingDividends(tx, h, { today: TODAY, dismissed: new Set(['PKO.WA|2026-06-20']) })).toEqual([]);
  });

  it('widok „Wszystkie": każdy portfel ma własny zapis', () => {
    const tx = [buy('PKO.WA', '2026-01-10', 100, { _portfolioId: 'a' }), buy('PKO.WA', '2026-01-10', 20, { _portfolioId: 'b' }),
      { ...div('PKO.WA', '2026-06-20', 5.47, 100), _portfolioId: 'a' }];
    const h = { 'PKO.WA': [{ date: '2026-06-20', amount: 5.47 }] };
    const [m, ...rest] = findMissingDividends(tx, h, { today: TODAY });
    expect(rest).toEqual([]);
    expect(m).toMatchObject({ symbol: 'PKO.WA', qty: 20, portfolioId: 'b' });
    expect(m.gross).toBeCloseTo(109.4, 6);
  });

  it('split po zakupie — liczba akcji w jednostkach po splicie, jak kwoty Yahoo', () => {
    const h = { NVDA: [{ date: '2026-09-10', amount: 0.01 }] };
    const tx = [buy('NVDA', '2026-01-10', 10), { type: 'SPLIT', symbol: 'NVDA', date: '2026-06-10', ratio: 10 }];
    expect(findMissingDividends(tx, h, { today: TODAY })[0].qty).toBe(100);
  });
});
