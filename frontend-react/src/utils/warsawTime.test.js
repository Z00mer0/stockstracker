import { describe, it, expect } from 'vitest';
import { warsawHour, warsawMinute, beforeDeliveryHour } from './warsawTime.js';

// Bramka godzinowa musi liczyc sie tak samo po obu stronach: server.py
// sprawdza `datetime.now(_WARSAW).hour < hour_pref`. Gdyby klient patrzyl
// na zegar urzadzenia, telefon w innej strefie pokazalby karty o innej
// porze niz przyszedl push.
describe('warsawHour', () => {
  it('czyta godzine warszawska, nie lokalna urzadzenia', () => {
    // 12:00 UTC w lipcu = 14:00 w Warszawie (CEST, UTC+2)
    expect(warsawHour(new Date('2026-07-15T12:00:00Z'))).toBe(14);
    // 12:00 UTC w styczniu = 13:00 w Warszawie (CET, UTC+1)
    expect(warsawHour(new Date('2026-01-15T12:00:00Z'))).toBe(13);
  });

  it('trzyma sie czasu letniego i zimowego', () => {
    // Ostatnia niedziela marca 2026 (29.03) — zmiana o 02:00 CET na 03:00 CEST
    expect(warsawHour(new Date('2026-03-29T00:30:00Z'))).toBe(1);   // jeszcze CET
    expect(warsawHour(new Date('2026-03-29T01:30:00Z'))).toBe(3);   // juz CEST
  });

  it('polnoc to 0, nie 24', () => {
    // 22:00 UTC w lipcu = 00:00 nastepnego dnia w Warszawie
    expect(warsawHour(new Date('2026-07-15T22:00:00Z'))).toBe(0);
  });

  it('zwraca godzine z zakresu 0-23', () => {
    for (let h = 0; h < 24; h++) {
      const v = warsawHour(new Date(Date.UTC(2026, 6, 15, h)));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(23);
    }
  });
});

describe('warsawMinute', () => {
  it('czyta minuty warszawskie', () => {
    expect(warsawMinute(new Date('2026-07-15T12:23:00Z'))).toBe(23);
    expect(warsawMinute(new Date('2026-07-15T12:00:00Z'))).toBe(0);
    expect(warsawMinute(new Date('2026-07-15T12:59:00Z'))).toBe(59);
  });
});

describe('beforeDeliveryHour', () => {
  // 12:00 UTC w lipcu = 14:00 w Warszawie
  const at14 = new Date('2026-07-15T12:00:00Z');
  const at1430 = new Date('2026-07-15T12:30:00Z');
  const at1429 = new Date('2026-07-15T12:29:00Z');

  it('przed godzina dostawy blokuje', () => {
    expect(beforeDeliveryHour(16, 0, at14)).toBe(true);
  });

  it('o pelnej godzinie juz przepuszcza — ta sama nierownosc co server.py', () => {
    expect(beforeDeliveryHour(14, 0, at14)).toBe(false);
  });

  it('po godzinie przepuszcza', () => {
    expect(beforeDeliveryHour(9, 0, at14)).toBe(false);
  });

  it('minuta liczy sie w porownaniu', () => {
    // 14:29 vs proba dostawy 14:30 — jeszcze blokuje
    expect(beforeDeliveryHour(14, 30, at1429)).toBe(true);
    // 14:30 vs 14:30 — juz przepuszcza (rowne = po)
    expect(beforeDeliveryHour(14, 30, at1430)).toBe(false);
    // 14:00 vs 14:30 — blokuje
    expect(beforeDeliveryHour(14, 30, at14)).toBe(true);
    // 14:30 vs 14:00 — przepuszcza
    expect(beforeDeliveryHour(14, 0, at1430)).toBe(false);
  });

  it('godzina 0 nigdy nie blokuje', () => {
    expect(beforeDeliveryHour(0, 0, at14)).toBe(false);
    expect(beforeDeliveryHour(0, 0, new Date('2026-07-15T22:30:00Z'))).toBe(false);
  });

  it('brak ustawienia nie blokuje niczego', () => {
    expect(beforeDeliveryHour(undefined, 0, at14)).toBe(false);
    expect(beforeDeliveryHour(NaN, 0, at14)).toBe(false);
  });

  it('stara sygnatura (hour, Date) nadal dziala', () => {
    // Backward-compat: gdy druga pozycja to Date, traktujemy jak now
    expect(beforeDeliveryHour(16, at14)).toBe(true);
    expect(beforeDeliveryHour(14, at14)).toBe(false);
  });
});
