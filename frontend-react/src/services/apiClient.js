// Wrapper na window.fetch: retry z exponential backoff (1s/2s/4s)
// dla GET /api/* na 503/504 (Render cold start ~30s, hobby plan).
// Mutacje (POST/PATCH/PUT/DELETE) NIE są retry'owane — ryzyko dubli.

const RETRY_STATUSES = new Set([503, 504]);
// Render hobby cold start bywa i 60-90s → retry window ~90s (2+5+10+15+25+30s).
// Toast pokazujemy dopiero po wyczerpaniu wszystkich prób.
const BACKOFF_MS = [2000, 5000, 10000, 15000, 25000, 30000];
const TOAST_COOLDOWN_MS = 10_000;
// Nie strasz toastem podczas rozgrzewki backendu — pierwsze 90s od boota
// najprawdopodobniej to jeszcze cold-start. Retry i tak leci, dane dotra.
const BOOT_QUIET_MS = 90_000;
const bootAt = Date.now();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pathOf(input) {
  if (typeof input === 'string') {
    if (input.startsWith('/')) return input;
    try { return new URL(input).pathname; } catch { return input; }
  }
  if (input instanceof URL) return input.pathname;
  const url = input?.url ?? '';
  try { return new URL(url).pathname; } catch { return url; }
}

function isRetriableRequest(input, init) {
  // Tylko /api/* (proxy do Render/backend). Zewnętrzne URL-e (Yahoo,
  // Eurostat, itp.) mają własne timeouty — nie ruszamy.
  if (!pathOf(input).startsWith('/api/')) return false;

  const method = (
    init?.method
    ?? (input && typeof input === 'object' && !(input instanceof URL) ? input.method : undefined)
    ?? 'GET'
  ).toUpperCase();
  return method === 'GET' || method === 'HEAD';
}

let installed = false;

// Fire-and-forget ping do /api/health tuż po boot appki — cold-start
// Rendera startuje rownolegle z inicjalizacja UI zamiast czekac na
// pierwszy request z Dashboardu. Ignorujemy wynik, retry i tak zalatwi
// wolne odpowiedzi.
export function warmupBackend() {
  const base = import.meta.env.VITE_API_URL ?? '';
  try {
    fetch(`${base}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(30_000),
    }).catch(() => {});
  } catch { /* older Safari bez AbortSignal.timeout */ }
}

export function installFetchRetry(showToast) {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  let lastToastAt = 0;

  const notify = () => {
    const now = Date.now();
    if (now - bootAt < BOOT_QUIET_MS) return;
    if (now - lastToastAt < TOAST_COOLDOWN_MS) return;
    lastToastAt = now;
    showToast?.('Serwer chwilowo niedostępny — spróbuj odświeżyć za chwilę', {
      type: 'error',
      duration: 5000,
    });
  };

  window.fetch = async (input, init) => {
    if (!isRetriableRequest(input, init)) {
      return originalFetch(input, init);
    }

    let lastErr = null;
    let lastRes = null;

    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      try {
        const res = await originalFetch(input, init);
        if (!RETRY_STATUSES.has(res.status)) return res;
        lastRes = res;
      } catch (err) {
        // AbortSignal timeout wywołanego przez caller — nie retry.
        if (err?.name === 'AbortError') throw err;
        lastErr = err;
      }
      if (attempt < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[attempt]);
      }
    }

    notify();
    if (lastRes) return lastRes;
    throw lastErr ?? new Error('fetch failed');
  };
}
