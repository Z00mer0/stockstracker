import { describe, it, expect } from 'vitest';
import { comparePrice } from './priceCheck.js';
import { parseStooqCsv, fetchStooq, _clearStooqCache, stooqSymbol, isFundSymbol, isStooqDirect } from '../../../api/_stooq.js';

const t = iso => Math.floor(Date.parse(iso) / 1000);

describe('parseStooqCsv', () => {
  it('kurs, data i godzina', () => {
    expect(parseStooqCsv('Symbol,Date,Time,Close\r\nPKO,2026-11-09,17:05:12,62.4\r\n')).toEqual({ source: 'stooq', price: 62.4, date: '2026-11-09', time: '17:05' });
  });
  it('brak danych (N/D) albo pusta odpowiedź', () => {
    expect(parseStooqCsv('Symbol,Date,Time,Close\nXYZ,N/D,N/D,N/D')).toBeNull();
    expect(parseStooqCsv('')).toBeNull();
  });
});

describe('fetchStooq', () => {
  it('tylko GPW i pamięć 5 minut', async () => {
    _clearStooqCache();
    let calls = 0;
    const fetchImpl = async () => { calls++; return { ok: true, text: async () => 'Symbol,Date,Time,Close\nCDR,2026-11-09,17:05:00,248.1' }; };
    expect(await fetchStooq('AAPL', { fetchImpl })).toBeNull();
    expect((await fetchStooq('CDR.WA', { fetchImpl, now: 1000 })).price).toBe(248.1);
    await fetchStooq('CDR.WA', { fetchImpl, now: 1000 + 60_000 });
    expect(calls).toBe(1);
    await fetchStooq('CDR.WA', { fetchImpl, now: 1000 + 6 * 60_000 });
    expect(calls).toBe(2);
  });
});

describe('comparePrice', () => {
  const check = { source: 'stooq', price: 63.5, date: '2026-11-09', time: '17:05' };
  it('rozjazd ponad 1% z tej samej sesji', () => {
    const r = comparePrice(62.4, t('2026-11-09T16:05:00Z'), check);
    expect(r.diffPct).toBeCloseTo(1.763, 2);
    expect(r.mismatch).toBe(true);
  });
  it('zgodne kursy albo kurs z innego dnia — bez ostrzeżenia', () => {
    expect(comparePrice(63.3, t('2026-11-09T16:05:00Z'), check).mismatch).toBe(false);
    expect(comparePrice(60, t('2026-11-08T16:05:00Z'), check).mismatch).toBe(false);
  });
  it('brak drugiego źródła', () => {
    expect(comparePrice(62.4, null, null)).toBeNull();
  });
});

describe('stooqSymbol — fundusze TFI', () => {
  it('kod 1048.N → 1048.n; GPW bez zmian; reszta null', () => {
    expect(isFundSymbol('1048.N')).toBe(true);
    expect(isFundSymbol('PKO.WA')).toBe(false);
    expect(stooqSymbol('1048.N')).toBe('1048.n');
    expect(stooqSymbol('PKO.WA')).toBe('pko');
    expect(stooqSymbol('AAPL')).toBe(null);
    expect(isStooqDirect('STOOQ:FW20Z2620')).toBe(true);
    expect(isStooqDirect('STOOQ:a b')).toBe(false);
    expect(stooqSymbol('STOOQ:FW20Z2620')).toBe('fw20z2620');
  });
});
