// src/components/layout/Header.jsx
import React from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

const PAGE_TITLES = {
  '/':             'Dashboard',
  '/portfolio':    'Portfel',
  '/history':      'Historia wartości',
  '/transactions': 'Transakcje',
  '/dividends':    'Dywidendy',
  '/calendar':     'Kalendarz',
  '/watchlist':    'Watchlist',
  '/settings':     'Ustawienia',
};

export default function Header({ onMenuToggle }) {
  const { pathname } = useLocation();
  const { loading, refresh } = useApp();
  const title = PAGE_TITLES[pathname] ?? 'StocksTracker';

  return (
    <header className="h-14 flex-shrink-0 flex items-center gap-3 px-4 md:px-6 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      {/* Hamburger — widoczny tylko na mobile */}
      <button
        onClick={onMenuToggle}
        className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex-shrink-0"
        aria-label="Otwórz menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <rect x="2" y="4" width="16" height="2" rx="1"/>
          <rect x="2" y="9" width="16" height="2" rx="1"/>
          <rect x="2" y="14" width="16" height="2" rx="1"/>
        </svg>
      </button>

      {/* Tytuł strony */}
      <h1 className="flex-1 text-base font-semibold text-slate-100 truncate">{title}</h1>

      {/* Odśwież */}
      <button
        onClick={refresh}
        disabled={loading}
        title="Odśwież dane"
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800 flex-shrink-0"
      >
        <span className={loading ? 'animate-spin' : ''}>↻</span>
        <span className="hidden sm:inline">{loading ? 'Ładowanie…' : 'Odśwież'}</span>
      </button>
    </header>
  );
}
