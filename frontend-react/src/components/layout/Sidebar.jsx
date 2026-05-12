import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { NAV_ITEMS } from './navItems';

export default function Sidebar() {
  const { displayName, logout } = useApp();

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-slate-950 border-r border-slate-800 h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">📈</span>
          <span className="font-bold text-sm text-slate-100 tracking-wide">StocksTracker</span>
        </div>
      </div>

      {/* Nawigacja */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
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

      {/* User + wyloguj */}
      <div className="px-5 py-4 border-t border-slate-800">
        {displayName && (
          <p className="text-xs text-slate-500 mb-2 truncate">{displayName}</p>
        )}
        <button
          onClick={logout}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Wyloguj →
        </button>
      </div>
    </aside>
  );
}
