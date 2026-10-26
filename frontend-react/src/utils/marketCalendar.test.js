import { describe, it, expect } from 'vitest';
import { easterSunday, holidays, isTradingDay, marketOf, isTodaysSession } from './marketCalendar.js';

describe('marketCalendar', () => {
  it('Wielkanoc', () => {
    expect(easterSunday(2024).toISOString().slice(0, 10)).toBe('2024-03-31');
    expect(easterSunday(2025).toISOString().slice(0, 10)).toBe('2025-04-20');
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
  });

  it('GPW 2026: Wielki Piątek, Boże Ciało, Wigilia i Sylwester zamknięte', () => {
    const h = holidays(2026, 'GPW');
    for (const d of ['2026-01-01', '2026-01-06', '2026-04-03', '2026-04-06', '2026-05-01', '2026-06-04', '2026-11-11', '2026-12-24', '2026-12-31']) {
      expect(h.has(d)).toBe(true);
    }
    expect(isTradingDay('2026-04-07', 'GPW')).toBe(true);
    expect(isTradingDay('2026-10-24', 'GPW')).toBe(false);   // sobota
  });

  it('NYSE: święta ruchome i przesunięte', () => {
    const h = holidays(2026, 'NYSE');
    for (const d of ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25']) {
      expect(h.has(d)).toBe(true);
    }
    // 2022: Nowy Rok w sobotę — 31.12.2021 normalny dzień sesyjny
    expect(holidays(2022, 'NYSE').has('2021-12-31')).toBe(false);
    expect(isTradingDay('2021-12-31', 'NYSE')).toBe(true);
    expect(isTradingDay('2026-11-11', 'NYSE')).toBe(true);
  });

  it('giełda spółki', () => {
    expect(marketOf('PKO.WA', 'PLN')).toBe('GPW');
    expect(marketOf('AAPL', 'USD')).toBe('NYSE');
    expect(marketOf('SAP.DE', 'EUR')).toBeNull();
  });

  it('notowanie z dzisiejszej sesji w strefie giełdy', () => {
    const now = new Date('2026-10-26T07:00:00Z');                  // pon. 8:00 w Warszawie, przed otwarciem
    const friday = Date.parse('2026-10-23T15:00:00Z') / 1000;
    expect(isTodaysSession(friday, 'Europe/Warsaw', now)).toBe(false);
    expect(isTodaysSession(Date.parse('2026-10-26T06:30:00Z') / 1000, 'Europe/Warsaw', now)).toBe(true);
    // 23:30 ET w niedzielę to już poniedziałek w Warszawie, ale nie w Nowym Jorku
    expect(isTodaysSession(friday, 'America/New_York', new Date('2026-10-26T03:30:00Z'))).toBe(false);
  });
});
