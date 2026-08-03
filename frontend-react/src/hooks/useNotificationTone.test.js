import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __internals } from './useNotificationTone.js';

// Zdarzenie `storage` lata tylko miedzy kartami — instancja, ktora zapisala
// wartosc, nie dostaje go nigdy. Przez to zmiana tonu w Ustawieniach nie
// docierala do dzwonka w naglowku (oba zamontowane naraz), a godzina
// sciagnieta z serwera nie docierala do nikogo do przeladowania strony.
// Odkad godzina bramkuje dzwonek, to drugie znaczylo: push o 9:00, dzwonek
// milczy do 16:00. Ten test pilnuje, ze zapis budzi wszystkie instancje.
const { writeTone, writeHour, toneListeners, hourListeners, readTone, readHour } = __internals;

describe('propagacja ustawien miedzy instancjami hookow', () => {
  const store = {};
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    toneListeners.clear();
    hourListeners.clear();
    vi.stubGlobal('localStorage', {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); toneListeners.clear(); hourListeners.clear(); });

  it('zapis tonu budzi kazda zamontowana instancje', () => {
    const bell = vi.fn();
    const settings = vi.fn();
    toneListeners.add(bell);
    toneListeners.add(settings);
    writeTone('funny');
    expect(bell).toHaveBeenCalledWith('funny');
    expect(settings).toHaveBeenCalledWith('funny');
    expect(readTone()).toBe('funny');
  });

  it('zapis godziny budzi kazda zamontowana instancje', () => {
    const bellGate = vi.fn();
    const settingsSelect = vi.fn();
    hourListeners.add(bellGate);
    hourListeners.add(settingsSelect);
    writeHour(9);
    expect(bellGate).toHaveBeenCalledWith(9);
    expect(settingsSelect).toHaveBeenCalledWith(9);
    expect(readHour()).toBe(9);
  });

  it('rozsyla wartosc PO walidacji, nie surowe wejscie', () => {
    const seen = vi.fn();
    toneListeners.add(seen);
    writeTone('bzdura');
    // readTone odrzuca nieznany ton — instancje maja dostac to, co realnie
    // siedzi w localStorage, a nie smiec, ktory tam nie doleci.
    expect(seen).toHaveBeenCalledWith('professional');
  });

  it('godzina spoza zakresu wraca do domyslnej dla wszystkich', () => {
    const seen = vi.fn();
    hourListeners.add(seen);
    writeHour(99);
    expect(seen).toHaveBeenCalledWith(16);
  });

  it('odsubskrybowana instancja nie jest juz wolana', () => {
    const gone = vi.fn();
    hourListeners.add(gone);
    hourListeners.delete(gone);
    writeHour(7);
    expect(gone).not.toHaveBeenCalled();
  });
});
