import React, { useEffect, useRef, useState } from 'react';
import NotificationCard from './NotificationCard';
import StockDetailModal from './StockDetailModal';
import { useMarketNotifications } from '../hooks/useMarketNotifications';
import { useNotificationTone } from '../hooks/useNotificationTone';
import { useT } from '../context/LanguageContext';
import { useApp } from '../context/AppContext';

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default function NotificationBell({ buttonStyle }) {
  const t = useT();
  const [tone] = useNotificationTone();
  const { notifications, dismiss } = useMarketNotifications();
  const { portfolio, addPosition, refresh } = useApp();
  const [open, setOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const wrapRef = useRef(null);

  // „Interesuje mnie to" prowadzi do szczegółów spółki. Powiadomienia lecą
  // z portfela i z watchlisty — dla tych pierwszych podajemy modalowi
  // prawdziwą pozycję (ilość, cena zakupu), dla drugich zaślepkę z qty 0.
  function openDetails(notification) {
    const held = (portfolio ?? []).find(p => p.symbol === notification.symbol);
    setSelectedStock(held ?? {
      symbol: notification.symbol,
      qty: 0,
      currency: notification.symbol.endsWith('.WA') ? 'PLN' : 'USD',
    });
    setOpen(false);
  }

  // Zamknięcie po kliknięciu poza panelem i po Escape — tak samo jak
  // wyszukiwarka w nagłówku, żeby zachowanie było spójne.
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = notifications.length;

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        style={{ ...buttonStyle, position: 'relative' }}
        onClick={() => setOpen(o => !o)}
        title={t('notif_bell_label')}
        aria-label={t('notif_bell_label')}
        aria-expanded={open}
      >
        <BellIcon />
        {count > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: 2, right: 2,
              minWidth: 15, height: 15, padding: '0 4px',
              borderRadius: 999, background: 'var(--accent)', color: '#04150c',
              fontSize: 9, fontWeight: 700, lineHeight: '15px', textAlign: 'center',
            }}
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('notif_panel_title')}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6,
            width: 'min(420px, calc(100vw - 24px))',
            maxHeight: 'min(70vh, 560px)', overflowY: 'auto',
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 100, padding: 10,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <div style={{
            fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase',
            letterSpacing: '0.06em', padding: '2px 4px',
          }}>
            {t('notif_panel_title')}
          </div>

          {count === 0 ? (
            <div style={{ padding: '18px 8px 22px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
              {t('notif_panel_empty')}
            </div>
          ) : notifications.map(n => (
            <NotificationCard
              key={n.dedupeKey}
              ticker={n.symbol}
              changePct={n.changePct}
              changeAbs={n.changeAbs}
              detectedAt={n.detectedAt}
              tone={tone}
              onInterested={() => { openDetails(n); dismiss(n.dedupeKey, { mute: true }); }}
              onNotInterested={() => dismiss(n.dedupeKey, { mute: true })}
            />
          ))}
        </div>
      )}

      {selectedStock && (
        <StockDetailModal
          item={selectedStock}
          existingPortfolio={portfolio}
          onSave={async (data) => { await addPosition(data); refresh(); }}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </div>
  );
}
