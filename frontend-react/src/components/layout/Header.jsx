// src/components/layout/Header.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { usePrivacy } from '../../context/PrivacyContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import AddStockModal from '../AddStockModal';
import StockDetailModal from '../StockDetailModal';

function isEuropeDST() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const lastSunMarch = new Date(Date.UTC(y, 2, 31));
  while (lastSunMarch.getUTCDay() !== 0) lastSunMarch.setUTCDate(lastSunMarch.getUTCDate() - 1);
  const lastSunOct = new Date(Date.UTC(y, 9, 31));
  while (lastSunOct.getUTCDay() !== 0) lastSunOct.setUTCDate(lastSunOct.getUTCDate() - 1);
  return now >= lastSunMarch && now < lastSunOct;
}

function isUsDST() {
  const now = new Date();
  const y = now.getUTCFullYear();
  // Second Sunday of March (starts at >= Mar 8)
  const secondSunMar = new Date(Date.UTC(y, 2, 8));
  while (secondSunMar.getUTCDay() !== 0) secondSunMar.setUTCDate(secondSunMar.getUTCDate() + 1);
  // First Sunday of November
  const firstSunNov = new Date(Date.UTC(y, 10, 1));
  while (firstSunNov.getUTCDay() !== 0) firstSunNov.setUTCDate(firstSunNov.getUTCDate() + 1);
  return now >= secondSunMar && now < firstSunNov;
}

const GPW_HOLIDAYS = new Set([
  '2025-01-01','2025-01-06','2025-04-18','2025-04-21','2025-05-01',
  '2025-06-19','2025-08-15','2025-11-11','2025-12-24','2025-12-25','2025-12-26','2025-12-31',
  '2026-01-01','2026-01-06','2026-04-03','2026-04-06','2026-05-01',
  '2026-06-04','2026-11-11','2026-12-24','2026-12-25','2026-12-31',
  '2027-01-01','2027-01-06','2027-03-26','2027-03-29','2027-05-03',
  '2027-05-27','2027-11-01','2027-11-11','2027-12-24','2027-12-31',
]);

const NYSE_HOLIDAYS = new Set([
  '2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26',
  '2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25',
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31',
  '2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
]);

const LSE_HOLIDAYS = new Set([
  '2025-01-01','2025-04-18','2025-04-21','2025-05-05','2025-05-26',
  '2025-08-25','2025-12-25','2025-12-26',
  '2026-01-01','2026-04-03','2026-04-06','2026-05-04','2026-05-25',
  '2026-08-31','2026-12-25','2026-12-28',
  '2027-01-01','2027-03-26','2027-03-29','2027-05-03','2027-05-31',
  '2027-08-30','2027-12-27','2027-12-28',
]);

function getMarketStatuses() {
  const now = new Date();
  const day = now.getUTCDay();
  const t = now.getUTCHours() * 60 + now.getUTCMinutes();
  const isWd = day >= 1 && day <= 5;
  const euDst = isEuropeDST();
  const usDst = isUsDST();
  const d = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  return [
    { label: 'GPW',  open: isWd && !GPW_HOLIDAYS.has(d)  && t >= (euDst ? 420 : 480) && t < (euDst ? 905 : 965) },
    { label: 'NYSE', open: isWd && !NYSE_HOLIDAYS.has(d) && t >= (usDst ? 810 : 870) && t < (usDst ? 1200 : 1260) },
    { label: 'LSE',  open: isWd && !LSE_HOLIDAYS.has(d)  && t >= (euDst ? 420 : 480) && t < (euDst ? 930 : 990) },
  ];
}

const FX_KEYS = new Set(['EUR/PLN', 'USD/PLN']);
const CACHE_KEY = 'myfund_market_tickers';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function formatPrice(key, price, locale = 'pl-PL') {
  if (price == null) return '—';
  if (FX_KEYS.has(key)) return price.toFixed(3);
  return Math.round(price).toLocaleString(locale).replace(/ /g, ' ');
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { tickers, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return tickers;
  } catch { return null; }
}

function saveCache(tickers) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ tickers, ts: Date.now() })); } catch {}
}

const FALLBACK_TICKERS = [
  { key: 'WIG20',   price: null, delta: null },
  { key: 'S&P500',  price: null, delta: null },
  { key: 'NASDAQ',  price: null, delta: null },
  { key: 'DAX',     price: null, delta: null },
  { key: 'EUR/PLN', price: null, delta: null },
  { key: 'USD/PLN', price: null, delta: null },
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

export default function Header({ theme, onThemeToggle, isMobile, onMenuToggle }) {
  const { refresh, loading, portfolio, addPosition } = useApp();
  const { isPrivate, toggle: togglePrivacy } = usePrivacy();
  const { language, locale, toggle: toggleLanguage } = useLanguage();
  const t = useT();
  const navigate = useNavigate();
  const [markets, setMarkets] = useState(getMarketStatuses);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [tickers, setTickers] = useState(() => loadCache() ?? FALLBACK_TICKERS);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const tickerRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0 });

  function handleTickerMouseDown(e) {
    const el = tickerRef.current;
    dragRef.current = { active: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
    el.style.cursor = 'grabbing';
  }
  function handleTickerMouseMove(e) {
    if (!dragRef.current.active) return;
    e.preventDefault();
    const el = tickerRef.current;
    el.scrollLeft = dragRef.current.scrollLeft - (e.pageX - el.offsetLeft - dragRef.current.startX);
  }
  function handleTickerMouseUp() {
    dragRef.current.active = false;
    if (tickerRef.current) tickerRef.current.style.cursor = 'grab';
  }

  useEffect(() => {
    const id = setInterval(() => setMarkets(getMarketStatuses()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function fetchTickers() {
      try {
        const res = await fetch('/api/market');
        if (!res.ok) return;
        const { tickers: fresh } = await res.json();
        setTickers(fresh);
        saveCache(fresh);
      } catch {}
    }
    if (!loadCache()) fetchTickers();
    // Refresh when cache expires
    const id = setInterval(() => {
      if (!loadCache()) fetchTickers();
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // ⌘K opens search
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') { setSearchOpen(false); setQuery(''); inputRef.current?.blur(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close on outside click
  useEffect(() => {
    function onDown(e) { if (searchRef.current && !searchRef.current.contains(e.target)) { setSearchOpen(false); setQuery(''); } }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const q = query.trim().toLowerCase();
  const searchResults = q.length < 1 ? (portfolio ?? []).slice(0, 6) : (portfolio ?? []).filter(p =>
    p.symbol?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q)
  ).slice(0, 8);

  function handleSearchSelect(item) {
    setSearchOpen(false); setQuery('');
    setSelectedStock(item);
  }

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
      display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12,
      padding: isMobile ? '0 12px' : '0 20px',
      background: 'var(--bg-2)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      {/* Hamburger — mobile only */}
      {isMobile && (
        <button
          onClick={onMenuToggle}
          style={{ ...iconBtn, flexShrink: 0 }}
          aria-label="Menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      )}
      {/* Search */}
      <div ref={searchRef} style={{ position: 'relative', maxWidth: 200, flex: '0 1 200px' }}>
        <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none', zIndex: 1 }}
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          ref={inputRef}
          className="field-input"
          style={{ paddingLeft: 32, paddingRight: 44, height: 34, fontSize: 12, color: 'var(--text-dim)' }}
          placeholder={t('search_placeholder')}
          value={query}
          onChange={e => { setQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
        />
        {!query && !isMobile && (
          <kbd style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            fontSize: 10, color: 'var(--text-faint)', background: 'var(--panel-2)',
            border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px',
            fontFamily: 'JetBrains Mono, monospace', pointerEvents: 'none',
          }}>⌘K</kbd>
        )}
        {searchOpen && searchResults.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 100, overflow: 'hidden',
          }}>
            {!query && <div style={{ padding: '6px 12px 4px', fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('your_portfolio')}</div>}
            {searchResults.map(item => (
              <div key={item.symbol}
                onMouseDown={() => handleSearchSelect(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--panel-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: 6, background: 'var(--panel-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
                }}>{item.symbol?.slice(0, 2)}</span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.symbol}</div>
                  {item.name && <div style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>}
                </div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{item.qty} szt.</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ticker strip — scrollable everywhere */}
      <div
        ref={tickerRef}
        className="no-scrollbar"
        onMouseDown={handleTickerMouseDown}
        onMouseMove={handleTickerMouseMove}
        onMouseUp={handleTickerMouseUp}
        onMouseLeave={handleTickerMouseUp}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 14 : 18,
          overflowX: 'auto',
          cursor: 'grab',
          userSelect: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tickers.map(tick => (
          <div key={tick.key} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.04em' }}>{tick.key}</span>
            <span className="mono" style={{ fontSize: isMobile ? 11 : 12, color: 'var(--text)' }}>{formatPrice(tick.key, tick.price, locale)}</span>
            {tick.delta != null && (
              <span className="mono" style={{ fontSize: 11, color: tick.delta >= 0 ? 'var(--up)' : 'var(--down)' }}>
                {tick.delta >= 0 ? '+' : ''}{tick.delta.toFixed(2)}%
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Market status dots — hidden on mobile */}
      {!isMobile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {markets.map(m => (
            <span key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-faint)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.open ? 'var(--up)' : 'var(--text-faint)', display: 'inline-block' }} />
              {m.label}
            </span>
          ))}
        </div>
      )}

      {/* Theme toggle */}
      <button
        style={iconBtn}
        onClick={onThemeToggle}
        title={theme === 'dark' ? t('light_theme') : t('dark_theme')}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>

      {/* Privacy toggle */}
      <button style={iconBtn} onClick={togglePrivacy} title={isPrivate ? t('show_values') : t('hide_values')}>
        <EyeIcon closed={isPrivate} />
      </button>

      {/* Language toggle */}
      <button
        style={iconBtn}
        onClick={toggleLanguage}
        title={language === 'pl' ? 'Switch to English' : 'Przełącz na Polski'}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>
          {language === 'pl' ? '🇬🇧' : '🇵🇱'}
        </span>
      </button>

      {/* Calendar / earnings shortcut */}
      {!isMobile && (
        <button
          style={iconBtn}
          onClick={() => navigate('/calendar')}
          title={t('earnings_calendar')}
          aria-label={t('earnings_calendar')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </button>
      )}

      {/* Add transaction CTA */}
      <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        {isMobile ? '+' : t('add_transaction')}
      </button>

      {showAdd && (
        <AddStockModal
          existingPortfolio={portfolio}
          onSave={async (data) => { await addPosition(data); refresh(); }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {selectedStock && (
        <StockDetailModal
          item={selectedStock}
          existingPortfolio={portfolio}
          onSave={async (data) => { await addPosition(data); refresh(); }}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </header>
  );
}
