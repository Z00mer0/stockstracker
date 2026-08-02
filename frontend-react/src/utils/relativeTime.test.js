import { describe, it, expect } from 'vitest';
import { formatRelative } from './relativeTime.js';

// Karta pokazywala na sztywno „1 minutę temu" niezaleznie od wieku
// powiadomienia — po godzinie w dzwonku dalej wisialo to samo zdanie.
const t = k => (k === 'notif_just_now' ? 'przed chwilą' : k);
const NOW = new Date('2026-08-01T12:00:00Z').getTime();
const ago = ms => NOW - ms;

describe('formatRelative', () => {
  it('ponizej minuty mowi „przed chwilą"', () => {
    expect(formatRelative(ago(0), 'pl', t, NOW)).toBe('przed chwilą');
    expect(formatRelative(ago(59_000), 'pl', t, NOW)).toBe('przed chwilą');
  });

  it('minuty rosna zamiast stac na „1 minutę temu"', () => {
    const one = formatRelative(ago(60_000), 'pl', t, NOW);
    const forty = formatRelative(ago(40 * 60_000), 'pl', t, NOW);
    expect(one).not.toBe(forty);
    expect(forty).toMatch(/40/);
  });

  it('odmienia polskie liczebniki (1 minutę / 2 minuty / 5 minut)', () => {
    expect(formatRelative(ago(1 * 60_000), 'pl', t, NOW)).toBe('1 minutę temu');
    expect(formatRelative(ago(2 * 60_000), 'pl', t, NOW)).toBe('2 minuty temu');
    expect(formatRelative(ago(5 * 60_000), 'pl', t, NOW)).toBe('5 minut temu');
  });

  it('przechodzi na godziny i dni', () => {
    expect(formatRelative(ago(90 * 60_000), 'pl', t, NOW)).toMatch(/godzin/);
    // numeric: 'auto' daje dla jednego dnia „wczoraj" zamiast „1 dzień temu"
    expect(formatRelative(ago(30 * 60 * 60_000), 'pl', t, NOW)).toBe('wczoraj');
    expect(formatRelative(ago(5 * 24 * 60 * 60_000), 'pl', t, NOW)).toBe('5 dni temu');
  });

  it('respektuje locale', () => {
    expect(formatRelative(ago(5 * 60_000), 'en-US', t, NOW)).toBe('5 minutes ago');
  });

  it('cofniety zegar nie daje „za 3 minuty"', () => {
    expect(formatRelative(NOW + 3 * 60_000, 'pl', t, NOW)).toBe('przed chwilą');
  });

  it('brak znacznika czasu nie wywraca karty', () => {
    expect(formatRelative(undefined, 'pl', t, NOW)).toBe('');
    expect(formatRelative(NaN, 'pl', t, NOW)).toBe('');
  });
});
