import { useEffect, useState } from 'react';
import { api } from './useApi';

// Publiczny link do portfela (/s/:token) — wspólne dla karty w Ustawieniach
// i okna „Pokaż znajomym” na Dashboardzie.
export default function useShareLink(portfolioId) {
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  // Widoczność w katalogu publicznych portfeli (/public) i nazwa, pod jaką tam jest.
  const [listing, setListing] = useState({ listed: false, publicName: '' });
  useEffect(() => {
    if (!portfolioId) return;
    let cancelled = false;
    setToken(null);
    setListing({ listed: false, publicName: '' });
    api.get(`/api/share?portfolio_id=${encodeURIComponent(portfolioId)}`)
      .then(res => {
        if (cancelled) return;
        setToken(res.data.token);
        setListing({ listed: !!res.data.listed, publicName: res.data.publicName ?? '' });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [portfolioId]);

  async function generate() {
    setBusy(true);
    try { setToken((await api.post('/api/share', { portfolio_id: portfolioId })).data.token); } catch { /* bez zmian */ } finally { setBusy(false); }
  }
  async function revoke() {
    setBusy(true);
    try { await api.post('/api/share/revoke', { portfolio_id: portfolioId }); setToken(null); setListing({ listed: false, publicName: '' }); } catch { /* bez zmian */ } finally { setBusy(false); }
  }
  async function saveListing(listed, name) {
    setBusy(true);
    try {
      const res = await api.post('/api/share/list', { portfolio_id: portfolioId, listed, name });
      setListing({ listed: res.data.listed, publicName: res.data.publicName });
    } finally { setBusy(false); }
  }
  const url = token ? `${window.location.origin}/s/${token}` : null;
  return { token, url, busy, generate, revoke, listing, saveListing };
}
