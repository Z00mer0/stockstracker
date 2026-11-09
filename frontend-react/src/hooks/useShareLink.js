import { useEffect, useState } from 'react';
import { api } from './useApi';

// Publiczny link do portfela (/s/:token) — wspólne dla karty w Ustawieniach
// i okna „Pokaż znajomym” na Dashboardzie.
export default function useShareLink(portfolioId) {
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!portfolioId) return;
    let cancelled = false;
    setToken(null);
    api.get(`/api/share?portfolio_id=${encodeURIComponent(portfolioId)}`)
      .then(res => { if (!cancelled) setToken(res.data.token); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [portfolioId]);

  async function generate() {
    setBusy(true);
    try { setToken((await api.post('/api/share', { portfolio_id: portfolioId })).data.token); } catch { /* bez zmian */ } finally { setBusy(false); }
  }
  async function revoke() {
    setBusy(true);
    try { await api.post('/api/share/revoke', { portfolio_id: portfolioId }); setToken(null); } catch { /* bez zmian */ } finally { setBusy(false); }
  }
  const url = token ? `${window.location.origin}/s/${token}` : null;
  return { token, url, busy, generate, revoke };
}
