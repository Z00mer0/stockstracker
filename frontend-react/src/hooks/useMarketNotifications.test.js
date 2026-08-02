import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchQuotes, quoteFromEntry } from './useMarketNotifications.js';

// Skan dzwonka wysylal jedno zadanie na symbol. Przy portfelu i watchliscie
// na kilkadziesiat pozycji to kilkadziesiat zadan co piec minut z KAZDEJ
// otwartej karty — ten sam wzorzec, ktory po stronie serwera naprawia
// test_quotes_batch.py. /api/quotes?format=map bierze do 60 symboli naraz.
function stubFetch(mapFor) {
  const calls = [];
  global.fetch = vi.fn(async (url) => {
    const symbols = decodeURIComponent(new URL(url, 'http://x').searchParams.get('symbols')).split(',');
    calls.push(symbols);
    return { ok: true, json: async () => ({ quotes: mapFor(symbols) }) };
  });
  return calls;
}

const goodEntry = (pct) => ({ quote: { regularMarketPrice: 100, regularMarketChangePercent: pct } });

afterEach(() => { vi.restoreAllMocks(); });

describe('fetchQuotes', () => {
  it('100 symboli to 2 zadania, nie 100', async () => {
    const syms = Array.from({ length: 100 }, (_, i) => `S${i}`);
    const calls = stubFetch(list => Object.fromEntries(list.map(s => [s, goodEntry(7)])));
    const out = await fetchQuotes(syms);
    expect(calls.length).toBe(2);
    expect(calls[0].length).toBe(60);
    expect(calls[1].length).toBe(40);
    expect(out.length).toBe(100);
  });

  it('jedno zadanie dla malej listy', async () => {
    const calls = stubFetch(list => Object.fromEntries(list.map(s => [s, goodEntry(-6)])));
    await fetchQuotes(['AMD', 'NVDA']);
    expect(calls.length).toBe(1);
  });

  it('padniete zadanie nie wywraca calego skanu', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline'); });
    await expect(fetchQuotes(['AMD'])).resolves.toEqual([]);
  });

  it('odpowiedz bez ok jest pomijana', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    await expect(fetchQuotes(['AMD'])).resolves.toEqual([]);
  });
});

describe('quoteFromEntry', () => {
  it('liczy zmiane kwotowa ze zmiany procentowej', () => {
    const q = quoteFromEntry('AMD', goodEntry(-7.87));
    expect(q.symbol).toBe('AMD');
    expect(q.changePct).toBeCloseTo(-7.87, 5);
    // 100 to cena PO spadku, wiec poprzednie zamkniecie bylo wyzej
    expect(q.changeAbs).toBeCloseTo(100 - 100 / (1 - 0.0787), 5);
    expect(q.changeAbs).toBeLessThan(0);
  });

  // Sciezka stooq oddaje sama cene — bez zmiany dziennej nie da sie ocenic
  // progu, wiec taki symbol pomijamy zamiast zgadywac (serwer robi tak samo).
  it('pomija wpis bez zmiany dziennej', () => {
    expect(quoteFromEntry('X', { quote: { regularMarketPrice: 10 } })).toBeNull();
    expect(quoteFromEntry('X', { price: 10 })).toBeNull();
  });

  it('pomija notFound i puste', () => {
    expect(quoteFromEntry('X', { notFound: true })).toBeNull();
    expect(quoteFromEntry('X', null)).toBeNull();
    expect(quoteFromEntry('X', { quote: { regularMarketPrice: 0, regularMarketChangePercent: 5 } })).toBeNull();
  });
});
