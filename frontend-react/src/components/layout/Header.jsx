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

export default function Header() {
  const { pathname } = useLocation();
  const { loading, refresh } = useApp();
  const title = PAGE_TITLES[pathname] ?? 'StocksTracker';

  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      <h1 className="text-base font-semibold text-slate-100">{title}</h1>

      <button
        onClick={refresh}
        disabled={loading}
        title="Odśwież dane"
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
      >
        <span className={loading ? 'animate-spin' : ''}>↻</span>
        {loading ? 'Ładowanie…' : 'Odśwież'}
      </button>
    </header>
  );
}
