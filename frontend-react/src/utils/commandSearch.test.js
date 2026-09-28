import { describe, it, expect } from 'vitest';
import { matchScore, rankCommands } from './commandSearch.js';

describe('matchScore', () => {
  it('bez polskich znaków i wielkości liter', () => {
    expect(matchScore('zamk', 'Zamknięte pozycje')).not.toBeNull();
    expect(matchScore('ustaw', 'Ustawienia')).not.toBeNull();
    expect(matchScore('zloto', 'Złoto')).not.toBeNull();
  });
  it('początek > początek słowa > fragment > litery po kolei > brak', () => {
    const a = matchScore('dy', 'Dywidendy');
    const b = matchScore('po', 'Zamknięte pozycje');
    const c = matchScore('wid', 'Dywidendy');
    const d = matchScore('dwd', 'Dywidendy');
    expect(a).toBeGreaterThan(b); expect(b).toBeGreaterThan(c); expect(c).toBeGreaterThan(d);
    expect(matchScore('xyz', 'Dywidendy')).toBeNull();
  });
});

describe('rankCommands', () => {
  const items = [
    { id: 'history', label: 'Historia' },
    { id: 'div', label: 'Dywidendy' },
    { id: 'pko', label: 'PKO.WA', keywords: ['PKO Bank Polski'] },
    { id: 'theme', label: 'Przełącz motyw', keywords: ['ciemny', 'jasny'] },
  ];
  it('puste zapytanie — wszystko w kolejności', () => expect(rankCommands(items, '  ').map(i => i.id)).toEqual(['history', 'div', 'pko', 'theme']));
  it('słowa kluczowe też pasują', () => {
    expect(rankCommands(items, 'bank').map(i => i.id)).toEqual(['pko']);
    expect(rankCommands(items, 'ciemn').map(i => i.id)).toEqual(['theme']);
  });
  it('najlepsze dopasowanie pierwsze', () => expect(rankCommands(items, 'p')[0].id).toBe('pko'));
});
