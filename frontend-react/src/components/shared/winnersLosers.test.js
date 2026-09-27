import { describe, it, expect } from 'vitest';
import { pickWinnersLosers } from './winnersLosers.js';

const rows = pcts => pcts.map((p, i) => ({ symbol: `S${i}`, _plPct: p }));
const syms = list => list.map(p => p.symbol);

describe('pickWinnersLosers', () => {
  it('przy 5 pozycjach żadna nie pojawia się dwa razy', () => {
    // Wcześniej: 4 najlepsze + 3 najgorsze ze stratą → S3 (−7%) dwa razy.
    const picked = pickWinnersLosers(rows([50, 20, 5, -7, -80]));
    expect(syms(picked)).toEqual(['S0', 'S1', 'S2', 'S3', 'S4']);
  });

  it('przy wielu pozycjach: 4 najlepsze i 3 najgorsze ze stratą', () => {
    const picked = pickWinnersLosers(rows([90, 80, 70, 60, 50, 40, -10, -20, -30]));
    expect(syms(picked)).toEqual(['S0', 'S1', 'S2', 'S3', 'S6', 'S7', 'S8']);
  });

  it('najgorsze bez straty nie trafiają do przegranych', () => {
    const picked = pickWinnersLosers(rows([90, 80, 70, 60, 50, 40, 30, -5]));
    expect(syms(picked)).toEqual(['S0', 'S1', 'S2', 'S3', 'S7']);
  });
});
