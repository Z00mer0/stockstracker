// Sprawdzamy, czy patch fetch nie ponawia 503 z trwałych powodów — konkretnie
// gdy backend jasno mówi "not configured". Dopóki tego nie było, brakujący
// FINNHUB_TOKEN na produkcji dodawał 87 sekund (2+5+10+15+25+30) do KAŻDEGO
// ładowania dashboardu, bo retry na 503 traktował trwały brak zmiennej tak
// samo jak zimny start Rendera. Zmierzone w devtools: 87796 ms.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Klient patchuje window.fetch, a testy w tym repo lecą w środowisku node
// (vitest bez jsdom — reszta to same testy utils). Podszywamy window pod
// globalThis, żeby nie ciągnąć jsdom-a dla jednego pliku.
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

// Kazdy test dostaje swiezy moduł, bo installFetchRetry ma stan modulowy
// (flaga installed, timestamp bootAt) i pozostawiony miedzy testami dawalby
// falszywe pozytywy. Importujemy dynamicznie po resecie.
async function withFreshClient() {
  vi.resetModules();
  return import('./apiClient.js');
}

function jsonRes(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('installFetchRetry', () => {
  let origFetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.useRealTimers();
  });

  it('503 z "not configured" nie idzie w retry — trwaly brak zmiennej srodowiskowej', async () => {
    const originalFetch = vi.fn().mockResolvedValue(
      jsonRes(503, { error: 'FINNHUB_TOKEN not configured' })
    );
    globalThis.fetch = originalFetch;

    const { installFetchRetry } = await withFreshClient();
    installFetchRetry();

    const res = await globalThis.fetch('/api/finnhub-batch?symbols=AAPL');

    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(503);
  });

  it('503 z generycznym bledem nadal jest ponawiany — moze byc przejsciowe', async () => {
    const originalFetch = vi.fn().mockResolvedValue(
      jsonRes(503, { error: 'db_error' })
    );
    globalThis.fetch = originalFetch;

    const { installFetchRetry } = await withFreshClient();
    installFetchRetry();

    const p = globalThis.fetch('/api/data');
    // przeklikaj wszystkie odstepy backoffu (2+5+10+15+25+30s = 87s)
    await vi.advanceTimersByTimeAsync(90_000);
    await p;

    // 1 pierwotna proba + 6 retry = 7 wywolan przy pelnym backoffie
    expect(originalFetch).toHaveBeenCalledTimes(7);
  });

  it('mutacje nigdy nie sa ponawiane — ryzyko dubli waznieje niz ryzyko utraconej proby',
      async () => {
    const originalFetch = vi.fn().mockResolvedValue(jsonRes(503, { error: 'db_error' }));
    globalThis.fetch = originalFetch;

    const { installFetchRetry } = await withFreshClient();
    installFetchRetry();

    await globalThis.fetch('/api/portfolios/x/data', { method: 'POST', body: '{}' });
    expect(originalFetch).toHaveBeenCalledTimes(1);
  });

  it('response body zostaje uzywalny przez wywolujacego — clone przy sprawdzaniu tresci',
      async () => {
    const originalFetch = vi.fn().mockResolvedValue(
      jsonRes(503, { error: 'FINNHUB_TOKEN not configured' })
    );
    globalThis.fetch = originalFetch;

    const { installFetchRetry } = await withFreshClient();
    installFetchRetry();

    const res = await globalThis.fetch('/api/finnhub-batch?symbols=AAPL');
    // Jesli patch zjadl body przez peek bez clone(), await res.json() rzuci.
    const body = await res.json();
    expect(body.error).toMatch(/not configured/);
  });
});
