// src/components/layout/MobileDrawer.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { NAV_ITEMS } from './navItems.jsx';

export default function MobileDrawer({ isOpen, onClose }) {
  const { displayName, logout } = useApp();

  function handleLogout() {
    onClose();
    logout();
  }

  return (
    <>
      {/* Overlay — klik zamyka drawer */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/60 transition-opacity duration-300 md:hidden ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-4/5 max-w-xs flex flex-col bg-slate-950 border-r border-slate-800 transition-transform duration-300 md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Menu nawigacyjne"
      >
        {/* Nagłówek drawera */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📈</span>
            <span className="font-bold text-sm text-slate-100 tracking-wide">StocksTracker</span>
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Zamknij menu"
          >
            ✕
          </button>
        </div>

        {/* Nawigacja */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-400 border-r-2 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Stopka — użytkownik + wyloguj */}
        <div className="px-5 py-4 border-t border-slate-800">
          {displayName && (
            <p className="text-xs text-slate-500 mb-3 truncate">{displayName}</p>
          )}
          <button
            onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Wyloguj →
          </button>
        </div>
      </aside>
    </>
  );
}
