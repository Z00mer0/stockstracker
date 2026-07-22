// src/components/layout/Sidebar.jsx
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useT } from '../../context/LanguageContext';
import { getNavItems, getNavBottom } from './navItems.jsx';

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

function PortfolioItem({ id, name, currency, isActive, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '7px 10px', borderRadius: 7,
        background: isActive ? 'var(--panel)' : 'transparent',
        boxShadow: isActive ? 'inset 3px 0 0 var(--accent)' : 'none',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        color: isActive ? 'var(--text)' : 'var(--text-dim)',
        fontSize: 13, fontWeight: 500,
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      <span style={{ opacity: 0.6, fontSize: 10 }}>◆</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {currency && <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{currency}</span>}
    </button>
  );
}

export default function Sidebar({ isMobile, isOpen, onClose, onNewPortfolio }) {
  const { displayName, logout, portfolios, activePortfolioId, switchPortfolio } = useApp();
  const t = useT();
  const NAV_ITEMS = getNavItems(t);
  const NAV_BOTTOM = getNavBottom(t);
  const [portfolioOpen, setPortfolioOpen] = useState(false);

  const allLabel = t('nav_all');
  const activePortfolio = activePortfolioId === 'all'
    ? { name: allLabel, currency: '' }
    : portfolios.find(p => p.id === activePortfolioId) || { name: allLabel, currency: '' };

  const allItems = [{ id: 'all', name: allLabel, currency: '' }, ...portfolios];

  const sidebarContent = (
    <aside style={{
      background: 'var(--bg-2)',
      borderRight: '1px solid var(--border)',
      height: '100dvh',
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
            aria-label={t('close_menu')}
          >
            ×
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* Portfolio switcher */}
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', padding: '8px 10px 4px' }}>
          {t('nav_portfolios')}
        </div>
        {/* Active portfolio row — click to expand */}
        <button
          onClick={() => setPortfolioOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '7px 10px', borderRadius: 7,
            background: 'var(--panel)', boxShadow: 'inset 3px 0 0 var(--accent)',
            border: 'none', cursor: 'pointer', textAlign: 'left',
            color: 'var(--text)', fontSize: 13, fontWeight: 500,
          }}
        >
          <span style={{ opacity: 0.6, fontSize: 10 }}>◆</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activePortfolio.name}</span>
          {activePortfolio.currency && <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{activePortfolio.currency}</span>}
          <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0, marginLeft: 2, transition: 'transform 0.15s', display: 'inline-block', transform: portfolioOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
        </button>
        {/* Dropdown list */}
        {portfolioOpen && (
          <div style={{ paddingLeft: 8 }}>
            {allItems.map(p => (
              <PortfolioItem
                key={p.id}
                id={p.id}
                name={p.name}
                currency={p.currency}
                isActive={activePortfolioId === p.id}
                onClick={id => { switchPortfolio(id); setPortfolioOpen(false); if (isMobile) onClose?.(); }}
              />
            ))}
            <button
              onClick={() => { setPortfolioOpen(false); onNewPortfolio?.(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '6px 10px', borderRadius: 7,
                background: 'none', border: '1px dashed var(--border)',
                cursor: 'pointer', color: 'var(--text-faint)', fontSize: 12,
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> {t('nav_new_portfolio')}
            </button>
          </div>
        )}
        <div style={{ height: 8 }} />
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', padding: '8px 10px 4px' }}>
          {t('nav_section_main')}
        </div>
        {NAV_ITEMS.map(item => <NavItem key={item.to} {...item} onClick={isMobile ? onClose : undefined} />)}
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', padding: '12px 10px 4px' }}>
          {t('nav_section_account')}
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
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName || t('user_label')}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('gpw_pln_label')}</div>
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
