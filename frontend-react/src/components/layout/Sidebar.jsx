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

function NavItem({ to, icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
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

export default function Sidebar({ isMobile, isOpen, onClose }) {
  const { displayName, logout } = useApp();

  const sidebarContent = (
    <aside style={{
      background: 'var(--bg-2)',
      borderRight: '1px solid var(--border)',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      width: 232,
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
        {isMobile && (
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4, lineHeight: 1, fontSize: 20 }}
            aria-label="Zamknij menu"
          >
            ×
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', padding: '8px 10px 4px' }}>
          Główne
        </div>
        {NAV_ITEMS.map(item => <NavItem key={item.to} {...item} onClick={isMobile ? onClose : undefined} />)}
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', padding: '12px 10px 4px' }}>
          Konto
        </div>
        {NAV_BOTTOM.map(item => <NavItem key={item.to} {...item} onClick={isMobile ? onClose : undefined} />)}
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

  // Desktop: static sidebar in grid
  if (!isMobile) return sidebarContent;

  // Mobile: fixed overlay drawer
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 199,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}
      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        zIndex: 200,
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {sidebarContent}
      </div>
    </>
  );
}
