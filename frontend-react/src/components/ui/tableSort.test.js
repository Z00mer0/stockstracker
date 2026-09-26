import { describe, it, expect } from 'vitest';
import { sortRows, nextSort } from './tableSort.js';

const get = r => r.v;

describe('sortRows', () => {
  it('sortuje liczby rosnąco i malejąco', () => {
    const rows = [{ v: 3 }, { v: -1 }, { v: 10 }];
    expect(sortRows(rows, get, 'asc').map(get)).toEqual([-1, 3, 10]);
    expect(sortRows(rows, get, 'desc').map(get)).toEqual([10, 3, -1]);
  });
  it('puste wartości zostają na końcu w obu kierunkach', () => {
    const rows = [{ v: null }, { v: 2 }, { v: NaN }, { v: 5 }, { v: undefined }];
    expect(sortRows(rows, get, 'asc').map(get).slice(0, 2)).toEqual([2, 5]);
    expect(sortRows(rows, get, 'desc').map(get).slice(0, 2)).toEqual([5, 2]);
  });
  it('tekst po polsku i z liczbami w środku', () => {
    const rows = [{ v: 'Żabka' }, { v: 'Allegro' }, { v: 'Łódź' }, { v: 'Orlen' }];
    expect(sortRows(rows, get).map(get)).toEqual(['Allegro', 'Łódź', 'Orlen', 'Żabka']);
    expect(sortRows([{ v: 'x10' }, { v: 'x9' }], get).map(get)).toEqual(['x9', 'x10']);
  });
  it('jest stabilne dla równych wartości', () => {
    const rows = [{ v: 1, id: 'a' }, { v: 1, id: 'b' }, { v: 0, id: 'c' }];
    expect(sortRows(rows, get, 'desc').map(r => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('nie zmienia tablicy wejściowej', () => {
    const rows = [{ v: 2 }, { v: 1 }];
    sortRows(rows, get);
    expect(rows.map(get)).toEqual([2, 1]);
  });
});

describe('nextSort', () => {
  it('nowa kolumna startuje od jej kierunku domyślnego', () => {
    expect(nextSort({ key: 'a', dir: 'asc' }, 'b', 'desc')).toEqual({ key: 'b', dir: 'desc' });
    expect(nextSort(null, 'b')).toEqual({ key: 'b', dir: 'asc' });
  });
  it('ta sama kolumna odwraca kierunek', () => {
    expect(nextSort({ key: 'a', dir: 'asc' }, 'a')).toEqual({ key: 'a', dir: 'desc' });
    expect(nextSort({ key: 'a', dir: 'desc' }, 'a')).toEqual({ key: 'a', dir: 'asc' });
  });
});
