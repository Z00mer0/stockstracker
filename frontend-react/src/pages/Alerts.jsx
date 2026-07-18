import { useEffect, useState, useMemo } from 'react';
import Card from '../components/shared/Card';
import TickerLogo from '../components/shared/TickerLogo';
import { useT } from '../context/LanguageContext';
import {
  apiLoadWatchlist, apiSaveWatchlist,
  collectAllAlerts, removeAlertFromItems,
} from '../services/watchlistService';

function fmtAlert(a, t) {
  if (a.kind === 'dailyChange') {
    return `${a.type === 'above' ? '↑' : '↓'} ${a.targetPercent}% dziś`;
  }
  if (a.kind === 'week52') {
    return a.type === 'above' ? `52W ↑ (${t('alert_new_high')})` : `52W ↓ (${t('alert_new_low')})`;
  }
  return `${a.type === 'above' ? '↑ powyżej' : '↓ poniżej'} ${a.targetPrice?.toFixed(2)}`;
}

function modeChip(mode, t) {
  const label = t(`alert_mode_${mode || 'once'}`);
  const emoji = mode === 'rearm' ? '↻' : mode === 'repeat' ? '🔁' : '·';
  return `${emoji} ${label}`;
}

export default function Alerts() {
  const t = useT();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('myfund_auth_token');
    if (!token) { setLoading(false); return; }
    apiLoadWatchlist()
      .then(data => { setItems(Array.isArray(data) ? data : []); })
      .catch(e => setError(e.message || 'Nie udało się załadować alertów'))
      .finally(() => setLoading(false));
  }, []);

  const allAlerts = useMemo(() => collectAllAlerts(items), [items]);

  const grouped = useMemo(() => {
    const armed     = allAlerts.filter(a => !a.triggered);
    const triggered = allAlerts.filter(a => a.triggered);
    return { armed, triggered };
  }, [allAlerts]);

  async function handleRemove(itemId, alertId) {
    const updated = removeAlertFromItems(items, itemId, alertId);
    setItems(updated);
    try { await apiSaveWatchlist(updated); }
    catch { setError('Nie udało się zapisać zmiany'); }
  }

  function Row({ a }) {
    return (
      <tr>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TickerLogo symbol={a.symbol} />
            <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{a.symbol}</span>
          </div>
        </td>
        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t(`alert_kind_${a.kind === 'week52' ? 'week52' : a.kind === 'dailyChange' ? 'daily' : 'price'}`)}</td>
        <td className="mono" style={{ fontSize: 12 }}>{fmtAlert(a, t)}</td>
        <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>{modeChip(a.mode, t)}</td>
        <td style={{ fontSize: 11 }}>
          {a.triggered
            ? <span className="chip chip-warn">wystrzelony</span>
            : <span className="chip chip-up">uzbrojony</span>}
        </td>
        <td className="right">
          <button
            onClick={() => handleRemove(a.itemId, a.id)}
            className="chip"
            style={{ cursor: 'pointer', border: 'none', color: 'var(--text-faint)' }}
            title={t('click_to_remove')}>
            ✕
          </button>
        </td>
      </tr>
    );
  }

  if (loading) {
    return (
      <Card title="🔔 Wszystkie alerty">
        <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>Ładowanie…</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="🔔 Wszystkie alerty">
        <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 12, color: 'var(--down)' }}>{error}</div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title={`🔔 Wszystkie alerty · ${allAlerts.length}`}>
        {allAlerts.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
            Brak aktywnych alertów. Ustaw pierwszy z menu ⋯ przy pozycji w portfelu albo z zakładki Obserwowane.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Typ</th>
                  <th>Warunek</th>
                  <th>Tryb</th>
                  <th>Status</th>
                  <th className="right"></th>
                </tr>
              </thead>
              <tbody>
                {grouped.armed.map(a => <Row key={a.id} a={a} />)}
                {grouped.triggered.map(a => <Row key={a.id} a={a} />)}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: '10px 20px', fontSize: 11, color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>
          Alerty sprawdzane są po stronie serwera (co kilka minut) i wysyłane jako powiadomienia push.
          Włącz push na stronie Obserwowane, żeby dostać powiadomienie nawet przy zamkniętej aplikacji.
        </div>
      </Card>
    </div>
  );
}
