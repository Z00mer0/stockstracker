import { describe, it, expect } from 'vitest';
import { buildInsights } from './insights.js';
import pl from '../../translations/pl.js';

const t = k => pl[k] ?? k;
const pos = (symbol, valuePLN, costPLN, extra = {}) => ({
  symbol, valuePLN, costPLN, pnlPLN: valuePLN - costPLN, pnlPct: (valuePLN - costPLN) / costPLN * 100, ...extra,
});
// Strata papierowa 3000 zł na XYZ, zysk papierowy na ABC.
const book = [pos('ABC', 12000, 10000), pos('DEF', 9000, 9000), pos('GHI', 9000, 9000), pos('XYZ', 7000, 10000)];
const tlh = list => list.find(i => i.title.startsWith('Tax Loss Harvesting'));

describe('buildInsights — tax loss harvesting', () => {
  it('oszczędność ograniczona do zrealizowanego zysku w roku', () => {
    // Zysk zrealizowany 1000 zł → strata obniży podatek tylko o 19% × 1000.
    expect(tlh(buildInsights(book, { t, locale: 'pl-PL', realizedYtdPLN: 1000 })).title).toContain('~190 PLN');
    expect(tlh(buildInsights(book, { t, locale: 'pl-PL', realizedYtdPLN: 50000 })).title).toContain('~570 PLN');
  });

  it('bez zrealizowanego zysku — brak obietnicy oszczędności (wcześniej 19% całej straty)', () => {
    expect(tlh(buildInsights(book, { t, locale: 'pl-PL', realizedYtdPLN: 0 }))).toBeUndefined();
  });

  it('IKE/IKZE — bez porad podatkowych', () => {
    const win = [pos('WIN', 30000, 10000), ...book];
    const list = buildInsights(win, { t, locale: 'pl-PL', realizedYtdPLN: 50000, taxable: false });
    expect(tlh(list)).toBeUndefined();
    expect(list.flatMap(i => i.lines).some(l => l.includes('19%'))).toBe(false);
  });

  it('rada o wash-sale zgodna z zakładką Podatki (w Polsce jej nie ma)', () => {
    const lines = tlh(buildInsights(book, { t, locale: 'pl-PL', realizedYtdPLN: 1000 })).lines;
    expect(lines.join(' ')).not.toMatch(/nie odkupuj przez 30 dni/);
  });
});

describe('buildInsights — Health Score', () => {
  it('teksty z tłumaczeń, nie wpisane na sztywno', () => {
    const en = { insight_health_title: 'Health Score: {total}/10 — {label}', insight_health_good: 'GOOD', insight_health_ok: 'OK', insight_health_bad: 'NEEDS WORK' };
    const list = buildInsights(book, { t: k => en[k] ?? k, locale: 'en-GB' });
    expect(list.at(-1).title).toMatch(/^Health Score: \d+\/10 — (GOOD|OK|NEEDS WORK)$/);
  });
});
