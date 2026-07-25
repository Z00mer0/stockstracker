import { describe, it, expect } from 'vitest';
import { txKey, dedupeBatch, dedupeAgainstExisting } from './brokerDedupe.js';

const cash = (symbol, date, type, qty, price, extra = {}) =>
  ({ symbol, date, type, qty, price, ...extra });
const closed = (symbol, date, type, qty, price, extra = {}) =>
  ({ symbol, date, type, qty, price, fromClosedPosition: true, ...extra });

describe('txKey', () => {
  it('rozróżnia transakcje po ilości', () => {
    expect(txKey(cash('X', '2026-01-01', 'BUY', 1, 10)))
      .not.toBe(txKey(cash('X', '2026-01-01', 'BUY', 2, 10)));
  });

  it('znosi różnice zaokrąglenia ceny', () => {
    expect(txKey(cash('X', '2026-01-01', 'BUY', 1, 34.91)))
      .toBe(txKey(cash('X', '2026-01-01', 'BUY', 1, 34.910000001)));
  });
});

describe('dedupeBatch', () => {
  it('zachowuje powtórzone legalne transakcje z jednego arkusza', () => {
    // Trzykrotne "CLOSE BUY 1 @ 34.91" tego samego dnia to trzy realne
    // transakcje, nie potrójny zapis jednej.
    const sheet = [
      cash('X', '2026-01-01', 'BUY', 1, 34.91),
      cash('X', '2026-01-01', 'BUY', 1, 34.91),
      cash('X', '2026-01-01', 'BUY', 1, 34.91),
    ];
    expect(dedupeBatch([sheet])).toHaveLength(3);
  });

  it('ten sam plik wgrany dwa razy nie dubluje transakcji', () => {
    const sheet = [cash('X', '2026-01-01', 'BUY', 1, 34.91), cash('X', '2026-01-01', 'BUY', 1, 34.91)];
    expect(dedupeBatch([sheet, [...sheet]])).toHaveLength(2);
  });

  it('zagregowany wiersz z Closed Positions odpada, gdy pokrywają go wiersze gotówkowe', () => {
    // Arkusz zamkniętych mówi "volume 3", gotówkowy ma trzy wiersze po 1.
    // To ta sama transakcja zapisana inaczej — zostać ma wersja gotówkowa.
    const cashSheet = [
      cash('X', '2026-01-01', 'SELL', 1, 50),
      cash('X', '2026-01-01', 'SELL', 1, 50),
      cash('X', '2026-01-01', 'SELL', 1, 50),
    ];
    const closedSheet = [closed('X', '2026-01-01', 'SELL', 3, 50)];
    const out = dedupeBatch([cashSheet, closedSheet]);
    expect(out).toHaveLength(3);
    expect(out.every(t => !t.fromClosedPosition)).toBe(true);
  });

  it('niepokryty wiersz z Closed Positions zostaje', () => {
    // Otwarcie pozycji sprzed okna eksportu gotówkowego — nie ma go w puli,
    // więc musi przejść, inaczej portfel straciłby pozycję.
    const closedSheet = [closed('Y', '2025-06-01', 'BUY', 10, 20)];
    const out = dedupeBatch([[cash('X', '2026-01-01', 'SELL', 1, 50)], closedSheet]);
    expect(out).toHaveLength(2);
    expect(out.some(t => t.symbol === 'Y')).toBe(true);
  });

  it('częściowe pokrycie zostawia wiersz zamknięty', () => {
    const cashSheet = [cash('X', '2026-01-01', 'SELL', 1, 50)];
    const closedSheet = [closed('X', '2026-01-01', 'SELL', 3, 50)];
    const out = dedupeBatch([cashSheet, closedSheet]);
    expect(out).toHaveLength(2);
  });

  it('bez arkusza zamkniętych zwraca same operacje gotówkowe', () => {
    const cashSheet = [cash('X', '2026-01-01', 'BUY', 1, 10)];
    expect(dedupeBatch([cashSheet])).toEqual(cashSheet);
  });
});

describe('dedupeAgainstExisting', () => {
  it('pomija transakcje już obecne w historii', () => {
    const existing = [cash('X', '2026-01-01', 'BUY', 1, 10)];
    expect(dedupeAgainstExisting([cash('X', '2026-01-01', 'BUY', 1, 10)], existing)).toHaveLength(0);
  });

  it('trzecie identyczne wystąpienie przechodzi, gdy w historii są dwa', () => {
    // Różnica multizbiorowa, nie "czy klucz już był" — inaczej gubilibyśmy
    // realne, powtórzone transakcje.
    const existing = [cash('X', '2026-01-01', 'BUY', 1, 10), cash('X', '2026-01-01', 'BUY', 1, 10)];
    const batch = [
      cash('X', '2026-01-01', 'BUY', 1, 10),
      cash('X', '2026-01-01', 'BUY', 1, 10),
      cash('X', '2026-01-01', 'BUY', 1, 10),
    ];
    expect(dedupeAgainstExisting(batch, existing)).toHaveLength(1);
  });

  it('odrzuca po brokerPositionId niezależnie od reszty pól', () => {
    const existing = [cash('X', '2026-01-01', 'BUY', 1, 10, { brokerPositionId: 'abc' })];
    const batch = [cash('X', '2026-05-05', 'BUY', 99, 999, { brokerPositionId: 'abc' })];
    expect(dedupeAgainstExisting(batch, existing)).toHaveLength(0);
  });

  it('godzi zagregowany wiersz zamknięty z gotówkowymi z poprzedniej sesji importu', () => {
    // Cash Ops zaimportowane wcześniej, Closed Positions dopiero teraz.
    const existing = [
      cash('X', '2026-01-01', 'SELL', 1, 50),
      cash('X', '2026-01-01', 'SELL', 1, 50),
      cash('X', '2026-01-01', 'SELL', 1, 50),
    ];
    expect(dedupeAgainstExisting([closed('X', '2026-01-01', 'SELL', 3, 50)], existing)).toHaveLength(0);
  });

  it('nowa transakcja przechodzi', () => {
    const existing = [cash('X', '2026-01-01', 'BUY', 1, 10)];
    const batch = [cash('Y', '2026-02-02', 'BUY', 5, 20)];
    expect(dedupeAgainstExisting(batch, existing)).toHaveLength(1);
  });
});
