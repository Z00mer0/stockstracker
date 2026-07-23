// Wrapper na window.fetch: retry z exponential backoff (1s/2s/4s)
// dla GET /api/* na 503/504 (Render cold start ~30s, hobby plan).
// Mutacje (POST/PATCH/PUT/DELETE) NIE są retry'owane — ryzyko dubli.

const RETRY_STATUSES = new Set([503, 504]);
const BACKOFF_MS = [1000, 2000, 4000];
const TOAST_COOLDOWN_MS = 10_000;

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

export function installFetchRetry(showToast) {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  let lastToastAt = 0;

  const notify = () => {
    const now = Date.now();
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
