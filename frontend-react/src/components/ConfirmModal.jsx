import React, { useEffect, useRef } from 'react';
import { useT } from '../context/LanguageContext';

// Zastępuje natywne window.confirm(). Tamto wyglądało obco na tle reszty
// aplikacji, nie dawało się przetłumaczyć i na części przeglądarek mobilnych
// potrafi zostać zablokowane przez ustawienia strony.
//
// Style celowo skopiowane z NewPortfolioModal, żeby okna potwierdzeń nie
// odstawały od pozostałych.

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.72)',
  backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};

const card = {
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 400,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
};

export default function ConfirmModal({ message, detail, confirmLabel, danger = true, onConfirm, onCancel }) {
  const t = useT();
  const confirmRef = useRef(null);

  // Escape zamyka, a fokus startuje na przycisku potwierdzenia — tak samo
  // zachowywało się natywne okno, którego to jest zamiennikiem.
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = e => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div style={overlay} onClick={onCancel} role="presentation">
      <div
        style={card}
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={message}
      >
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>
          {message}
        </p>
        {detail && (
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 16px' }}>{detail}</p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: detail ? 0 : 16 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13,
            }}
          >
            {t('cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: danger ? 'var(--down)' : 'var(--accent)',
              color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            {confirmLabel ?? t('delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
