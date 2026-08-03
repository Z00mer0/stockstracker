import { describe, it, expect } from 'vitest';
import { warsawHour, beforeDeliveryHour } from './warsawTime.js';

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

describe('beforeDeliveryHour', () => {
  // 12:00 UTC w lipcu = 14:00 w Warszawie
  const at14 = new Date('2026-07-15T12:00:00Z');

  it('przed godzina dostawy blokuje', () => {
    expect(beforeDeliveryHour(16, at14)).toBe(true);
  });

  it('o pelnej godzinie juz przepuszcza — ta sama nierownosc co server.py', () => {
    expect(beforeDeliveryHour(14, at14)).toBe(false);
  });

  it('po godzinie przepuszcza', () => {
    expect(beforeDeliveryHour(9, at14)).toBe(false);
  });

  it('godzina 0 nigdy nie blokuje', () => {
    expect(beforeDeliveryHour(0, at14)).toBe(false);
    expect(beforeDeliveryHour(0, new Date('2026-07-15T22:30:00Z'))).toBe(false);
  });

  it('brak ustawienia nie blokuje niczego', () => {
    expect(beforeDeliveryHour(undefined, at14)).toBe(false);
    expect(beforeDeliveryHour(NaN, at14)).toBe(false);
  });
});
