// src/components/layout/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { NAV_ITEMS, NAV_BOTTOM } from './navItems.jsx';

const BrandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 10px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 500,
        color: isActive ? 'var(--text)' : 'var(--text-dim)',
        background: isActive ? 'var(--panel)' : 'transparent',
        boxShadow: isActive ? 'inset 3px 0 0 var(--accent)' : 'none',
        textDecoration: 'none',
        transition: 'background 0.1s, color 0.1s',
      })}
    >
      <span style={{ opacity: 0.75, flexShrink: 0 }}>{icon}</span>
      {label}
    </NavLink>
  );
}

export default function Sidebar() {
  const { displayName, logout } = useApp();

  return (
    <aside style={{
      background: 'var(--bg-2)',
      borderRight: '1px solid var(--border)',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Brand */}
      <div style={{ padding: '20px 16px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent), #00a863)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#051a10',
        }}>
          <BrandIcon />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          stockstracker<span style={{ color: 'var(--accent)' }}>.</span>
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', padding: '8px 10px 4px' }}>
          Główne
        </div>
        {NAV_ITEMS.map(item => <NavItem key={item.to} {...item} />)}
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', padding: '12px 10px 4px' }}>
          Konto
        </div>
        {NAV_BOTTOM.map(item => <NavItem key={item.to} {...item} />)}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--panel-2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace',
        }}>
          {(displayName || 'U').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName || 'Użytkownik'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>GPW · PLN</div>
        </div>
        <button
          onClick={logout}
          style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
        >
          ↪
        </button>
      </div>
    </aside>
  );
}
