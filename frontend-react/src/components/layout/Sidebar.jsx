// src/components/layout/Sidebar.jsx
import { Fragment, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { TrendingUp, LogOut, X, ChevronDown, Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useT } from '../../context/LanguageContext';
import { getNavItems, getNavBottom } from './navItems.jsx';
import IconButton from '../ui/IconButton.jsx';
import { cx } from '../ui/cx.js';

// Menu boczne. Na komputerze można je zwinąć do paska ikon (`collapsed`) —
// wtedy etykiety znikają, a nazwa strony zostaje w dymku i dla czytnika
// ekranu. Na telefonie to szuflada otwierana z dolnego paska („Więcej").

const NAV_GROUPS = ['portfolio', 'market', 'tools'];

function NavItem({ to, icon, label, collapsed, onClick }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) => cx(
        'relative flex items-center gap-2.5 rounded-card-sm py-[7px] text-[13px] font-medium transition-colors duration-100',
        collapsed ? 'justify-center px-0' : 'px-2.5',
        isActive
          ? 'bg-panel text-fg shadow-card before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-accent'
          : 'text-dim hover:bg-panel-hover hover:text-fg',
      )}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

function SectionLabel({ collapsed, children }) {
  // W pasku ikon nagłówek sekcji zamienia się w cienką kreskę — grupy
  // nadal są widoczne, a tekst się nie mieści.
  if (collapsed) return <div aria-hidden className="mx-3 my-2.5 h-px bg-line" />;
  return <div className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">{children}</div>;
}

const initials = name => (name || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 2).toUpperCase() || '?';

export default function Sidebar({ isMobile, isOpen, onClose, onNewPortfolio, collapsed = false, onToggleCollapse }) {
  const { displayName, logout, portfolios, activePortfolioId, switchPortfolio } = useApp();
  const t = useT();
  const NAV_ITEMS = getNavItems(t);
  const NAV_BOTTOM = getNavBottom(t);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const rail = collapsed && !isMobile;

  const allLabel = t('nav_all');
  const activePortfolio = activePortfolioId === 'all'
    ? { name: allLabel, currency: '' }
    : portfolios.find(p => p.id === activePortfolioId) || { name: allLabel, currency: '' };
  const allItems = [{ id: 'all', name: allLabel, currency: '' }, ...portfolios];

  // Esc zamyka szufladę na telefonie.
  useEffect(() => {
    if (!isMobile || !isOpen) return undefined;
    const onKey = e => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMobile, isOpen, onClose]);

  const closeOnMobile = isMobile ? onClose : undefined;

  const content = (
    <aside className={cx('flex h-[100dvh] flex-col overflow-hidden border-r border-line bg-bg-2', isMobile ? 'w-[272px]' : 'w-full')}>
      {/* Marka */}
      <div className={cx('flex items-center gap-2.5 pb-3 pt-5', rail ? 'justify-center px-0' : 'px-4')}>
        <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-card-sm bg-gradient-to-br from-[var(--accent)] to-[#8b5cf6] text-accent-fg">
          <TrendingUp size={16} strokeWidth={2.5} aria-hidden />
        </div>
        {!rail && (
          <span className="text-sm font-bold tracking-tight text-fg">
            myfund<span className="text-accent-text">.</span>
          </span>
        )}
        {isMobile && <IconButton icon={X} label={t('close_menu')} size="sm" onClick={onClose} className="ml-auto" />}
      </div>

      <nav className="flex flex-1 flex-col gap-px overflow-y-auto px-2.5 py-1">
        {/* Przełącznik portfela */}
        {!rail && <SectionLabel>{t('nav_portfolios')}</SectionLabel>}
        {rail ? (
          <button
            type="button"
            title={activePortfolio.name}
            aria-label={`${t('nav_portfolios')}: ${activePortfolio.name}`}
            onClick={() => { onToggleCollapse?.(); setPortfolioOpen(true); }}
            className="mx-auto grid h-9 w-9 place-items-center rounded-card-sm border border-line bg-panel text-[11px] font-bold text-dim transition hover:border-line-strong hover:text-fg"
          >
            {initials(activePortfolio.name)}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPortfolioOpen(o => !o)}
            aria-expanded={portfolioOpen}
            className="flex w-full items-center gap-2 rounded-card-sm border border-line bg-panel px-2.5 py-2 text-left text-[13px] font-medium text-fg transition hover:border-line-strong"
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-panel-2 text-[9px] font-bold text-dim">{initials(activePortfolio.name)}</span>
            <span className="min-w-0 flex-1 truncate">{activePortfolio.name}</span>
            {activePortfolio.currency && <span className="shrink-0 text-[10px] text-faint">{activePortfolio.currency}</span>}
            <ChevronDown size={14} aria-hidden className={cx('shrink-0 text-faint transition-transform', portfolioOpen && 'rotate-180')} />
          </button>
        )}
        {portfolioOpen && !rail && (
          <div className="mt-1 flex flex-col gap-px pl-2">
            {allItems.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { switchPortfolio(p.id); setPortfolioOpen(false); closeOnMobile?.(); }}
                aria-current={activePortfolioId === p.id || undefined}
                className={cx(
                  'flex w-full items-center gap-2 rounded-card-sm px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors',
                  activePortfolioId === p.id ? 'bg-panel text-fg' : 'text-dim hover:bg-panel-hover hover:text-fg',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.currency && <span className="shrink-0 text-[10px] text-faint">{p.currency}</span>}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setPortfolioOpen(false); onNewPortfolio?.(); }}
              className="mt-1 flex w-full items-center gap-2 rounded-card-sm border border-dashed border-line px-2.5 py-1.5 text-small text-faint transition hover:border-line-strong hover:text-fg"
            >
              <Plus size={13} aria-hidden /> {t('nav_new_portfolio')}
            </button>
          </div>
        )}

        {/* Czternaście pozycji w jednej kolumnie czytało się jak spis treści —
            grupy pozwalają trafić wzrokiem w sekcję, zanim w pozycję. */}
        {NAV_GROUPS.map(group => (
          <Fragment key={group}>
            <SectionLabel collapsed={rail}>{t(`nav_section_${group}`)}</SectionLabel>
            {NAV_ITEMS.filter(item => item.group === group).map(item => (
              <NavItem key={item.to} {...item} collapsed={rail} onClick={closeOnMobile} />
            ))}
          </Fragment>
        ))}
        <SectionLabel collapsed={rail}>{t('nav_section_account')}</SectionLabel>
        {NAV_BOTTOM.map(item => <NavItem key={item.to} {...item} collapsed={rail} onClick={closeOnMobile} />)}
      </nav>

      {/* Zwijanie — tylko na komputerze */}
      {!isMobile && (
        <div className="border-t border-line px-2.5 py-1.5">
          <button
            type="button"
            onClick={onToggleCollapse}
            title={rail ? t('sidebar_expand') : undefined}
            aria-label={rail ? t('sidebar_expand') : t('sidebar_collapse')}
            aria-expanded={!rail}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-card-sm py-2 text-[13px] font-medium text-faint transition-colors hover:bg-panel-hover hover:text-fg',
              rail ? 'justify-center' : 'px-2.5',
            )}
          >
            {rail ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
            {!rail && t('sidebar_collapse')}
          </button>
        </div>
      )}

      {/* Stopka: użytkownik i wylogowanie */}
      <div className={cx('flex items-center gap-2.5 border-t border-line py-3', rail ? 'flex-col px-0' : 'px-4')}>
        <div
          title={rail ? (displayName || t('user_label')) : undefined}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-panel-2 text-[11px] font-bold text-dim"
        >
          {initials(displayName || 'U')}
        </div>
        {!rail && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-fg">{displayName || t('user_label')}</div>
            <div className="text-[11px] text-faint">{t('gpw_pln_label')}</div>
          </div>
        )}
        <IconButton icon={LogOut} label={t('logout_btn')} size="sm" onClick={logout} />
      </div>
    </aside>
  );

  if (!isMobile) return content;

  // Telefon: szuflada nad treścią. Zamknięta jest `inert` — inaczej Tab
  // wędrował po niewidocznych linkach schowanych za lewą krawędzią.
  return (
    <>
      {isOpen && <div onClick={onClose} className="ui-overlay fixed inset-0 z-[199] bg-black/60 backdrop-blur-[2px]" aria-hidden />}
      <div
        className={cx('fixed inset-y-0 left-0 z-[200] transition-transform duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]', isOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full')}
        {...(!isOpen && { inert: '', 'aria-hidden': true })}
      >
        {content}
      </div>
    </>
  );
}
