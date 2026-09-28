import { describe, it, expect } from 'vitest';
import { displayStart } from './chartPeriods.js';

const days = (from, n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
  return { date: d.toISOString().slice(0, 10) };
});

describe('displayStart', () => {
  it('1M: od ostatniej świecy 31 dni wstecz (reszta to rozbieg wskaźników)', () => {
    const c = days('2026-01-01', 200);            // do 2026-07-19
    const i = displayStart(c, '1M');
    expect(c[i].date).toBe('2026-06-19');
    expect(i).toBe(169);
  });

  it('1D: tylko ostatnia sesja (również w weekend)', () => {
    const c = [
      { date: '2026-09-24' }, { date: '2026-09-24' },
      { date: '2026-09-25' }, { date: '2026-09-25' }, { date: '2026-09-25' },
    ];
    expect(displayStart(c, '1D')).toBe(2);
  });

  it('1W: pięć ostatnich sesji', () => {
    const c = days('2026-09-01', 10).flatMap(d => [d, d]);
    expect(c[displayStart(c, '1W')].date).toBe('2026-09-06');
  });

  it('ALL i krótka historia: od początku', () => {
    expect(displayStart(days('2026-01-01', 10), 'ALL')).toBe(0);
    expect(displayStart(days('2026-01-01', 10), '1Y')).toBe(0);
    expect(displayStart([], '1M')).toBe(0);
  });
});
