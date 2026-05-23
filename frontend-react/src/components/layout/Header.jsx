// src/components/layout/Header.jsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { usePrivacy } from '../../context/PrivacyContext';
import AddStockModal from '../AddStockModal';

function isEuropeDST() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const lastSunMarch = new Date(Date.UTC(y, 2, 31));
  while (lastSunMarch.getUTCDay() !== 0) lastSunMarch.setUTCDate(lastSunMarch.getUTCDate() - 1);
  const lastSunOct = new Date(Date.UTC(y, 9, 31));
  while (lastSunOct.getUTCDay() !== 0) lastSunOct.setUTCDate(lastSunOct.getUTCDate() - 1);
  return now >= lastSunMarch && now < lastSunOct;
}

function getMarketStatuses() {
  const now = new Date();
  const day = now.getUTCDay();
  const t = now.getUTCHours() * 60 + now.getUTCMinutes();
  const isWd = day >= 1 && day <= 5;
  const dst = isEuropeDST();
  return [
    { label: 'GPW',  open: isWd && t >= (dst ? 420 : 480) && t < (dst ? 905 : 965) },
    { label: 'NYSE', open: isWd && t >= 870 && t < 1260 },
    { label: 'LSE',  open: isWd && t >= (dst ? 420 : 480) && t < (dst ? 930 : 990) },
  ];
}

const TICKERS = [
  { sym: 'WIG20', val: '2 156', delta: +0.43 },
  { sym: 'S&P500', val: '5 308', delta: -0.12 },
  { sym: 'DAX', val: '18 921', delta: +0.67 },
  { sym: 'EUR/PLN', val: '4.278', delta: -0.08 },
  { sym: 'USD/PLN', val: '3.921', delta: +0.21 },
];

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const EyeIcon = ({ closed }) => closed ? (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

export default function Header({ theme, onThemeToggle }) {
  const { refresh, loading, portfolio, addPosition } = useApp();
  const { isPrivate, toggle } = usePrivacy();
  const [markets, setMarkets] = useState(getMarketStatuses);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setMarkets(getMarketStatuses()), 60000);
    return () => clearInterval(id);
  }, []);

  const iconBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 8,
    background: 'none', border: 'none',
    color: 'var(--text-dim)', cursor: 'pointer',
    transition: 'background 0.1s, color 0.1s',
  };

  return (
    <header style={{
      height: 56, flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 20px',
      background: 'var(--bg-2)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 320, flex: '0 1 320px' }}>
        <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }}
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="field-input"
          style={{ paddingLeft: 32, paddingRight: 44, height: 34, fontSize: 12, color: 'var(--text-dim)' }}
          placeholder="Szukaj…"
          readOnly
        />
        <kbd style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          fontSize: 10, color: 'var(--text-faint)', background: 'var(--panel-2)',
          border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px',
          fontFamily: 'JetBrains Mono, monospace',
        }}>⌘K</kbd>
      </div>

      {/* Ticker strip */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 18, overflow: 'hidden' }}>
        {TICKERS.map(t => (
          <div key={t.sym} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.04em' }}>{t.sym}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>{t.val}</span>
            <span className="mono" style={{ fontSize: 11, color: t.delta >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {t.delta >= 0 ? '+' : ''}{t.delta.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>

      {/* Market status dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {markets.map(m => (
          <span key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-faint)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.open ? 'var(--up)' : 'var(--text-faint)', display: 'inline-block' }} />
            {m.label}
          </span>
        ))}
      </div>

      {/* Theme toggle */}
      <button
        style={iconBtn}
        onClick={onThemeToggle}
        title={theme === 'dark' ? 'Motyw jasny' : 'Motyw ciemny'}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>

      {/* Privacy toggle */}
      <button style={iconBtn} onClick={toggle} title={isPrivate ? 'Pokaż wartości' : 'Ukryj wartości'}>
        <EyeIcon closed={isPrivate} />
      </button>

      {/* Bell */}
      <div style={{ position: 'relative' }}>
        <button style={iconBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>
        <span style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: '50%', background: 'var(--down)', border: '1.5px solid var(--bg-2)', pointerEvents: 'none' }} />
      </div>

      {/* Add transaction CTA */}
      <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ fontSize: 12 }}>
        + Dodaj transakcję
      </button>

      {showAdd && (
        <AddStockModal
          existingPortfolio={portfolio}
          onSave={async (data) => { await addPosition(data); refresh(); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </header>
  );
}
