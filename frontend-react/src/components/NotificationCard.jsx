import React from 'react';
import { useT, useLanguage } from '../context/LanguageContext';
import { getNotificationText } from '../utils/notificationText.js';

function ChevronIcon({ up }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      style={{ transform: up ? 'rotate(0deg)' : 'rotate(90deg)' }}>
      <path
        d={up ? 'M4 17 L11 10 L15 14 L20 8' : 'M4 7 L11 14 L15 10 L20 16'}
        stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d={up ? 'M15 8 L20 8 L20 13' : 'M15 16 L20 16 L20 11'}
        stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function GoogleFinanceMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3"  y="12" width="3.2" height="9" rx="1" fill="#EA4335" />
      <rect x="8"  y="7"  width="3.2" height="14" rx="1" fill="#FBBC04" />
      <rect x="13" y="15" width="3.2" height="6" rx="1" fill="#34A853" />
      <path d="M18 8 L21 5" stroke="#4285F4" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M21 5 L21 9" stroke="#4285F4" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M21 5 L17 5" stroke="#4285F4" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export default function NotificationCard({
  ticker,
  changePct,
  changeAbs,
  tone = 'professional',
  timestampLabel,
  onInterested,
  onNotInterested,
}) {
  const t = useT();
  const { locale } = useLanguage();
  const up = Number(changePct) >= 0;
  const color = up ? 'var(--up)' : 'var(--down)';

  const pctText = `${up ? '+' : '−'}${Math.abs(Number(changePct) || 0).toLocaleString(locale, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}%`;
  const absText = changeAbs == null
    ? ''
    : `(${up ? '+' : '−'}${Math.abs(Number(changeAbs)).toLocaleString(locale, {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      })})`;

  const body = getNotificationText({ ticker, changePct, tone, t });

  return (
    <div
      role="status"
      style={{
        background: 'var(--panel)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px 12px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
        display: 'grid',
        gridTemplateColumns: '28px 1fr auto',
        columnGap: 12,
        rowGap: 6,
        maxWidth: 480,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ color, paddingTop: 2 }}>
        <ChevronIcon up={up} />
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-dim)',
          letterSpacing: 0.2, marginBottom: 2,
        }}>
          {t('notif_source_label')}
        </div>
        <div style={{
          fontSize: 18, fontWeight: 700, lineHeight: 1.25, color: 'var(--text)',
          marginBottom: 6,
        }}>
          <span style={{ marginRight: 8 }}>{ticker}</span>
          <span style={{ color }}>{pctText}</span>
          {absText && <span style={{ color, marginLeft: 8, fontWeight: 600 }}>{absText}</span>}
        </div>
        <div style={{
          fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-line', lineHeight: 1.4,
        }}>
          {body}
        </div>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        gap: 8, color: 'var(--text-dim)', fontSize: 12,
      }}>
        <span>{timestampLabel || t('notif_minute_ago')}</span>
        <GoogleFinanceMark />
      </div>

      <div style={{
        gridColumn: '1 / -1', display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap',
      }}>
        <button
          type="button"
          onClick={onInterested}
          style={{
            flex: '1 1 auto', minWidth: 140,
            background: 'var(--panel-2)', color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 999, padding: '10px 14px',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          {t('notif_interested')}
        </button>
        <button
          type="button"
          onClick={onNotInterested}
          style={{
            flex: '1 1 auto', minWidth: 140,
            background: 'var(--panel-2)', color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 999, padding: '10px 14px',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          {t('notif_not_interested')}
        </button>
      </div>
    </div>
  );
}
