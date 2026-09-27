// src/components/layout/BottomNav.jsx
import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Ellipsis } from 'lucide-react';
import { useT } from '../../context/LanguageContext';
import { getNavItems } from './navItems.jsx';
import { cx } from '../ui/cx.js';

// Dolny pasek na telefonie: cztery najczęściej używane strony pod kciukiem
// i „Więcej", które otwiera pełne menu. Wcześniej jedyną drogą był
// hamburger w lewym górnym rogu — najdalszy punkt ekranu od kciuka.
export const PRIMARY_ROUTES = ['/', '/portfolio', '/transactions', '/dividends'];

const isActiveRoute = (route, pathname) => (route === '/' ? pathname === '/' : pathname.startsWith(route));

const itemClass = 'flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium leading-tight transition-colors';
const pillClass = active => cx(
  'grid h-7 w-12 place-items-center rounded-full transition-colors',
  active ? 'bg-panel-hover text-accent-text' : '',
);

export default function BottomNav({ onMore, moreOpen }) {
  const t = useT();
  const { pathname } = useLocation();
  const byRoute = Object.fromEntries(getNavItems(t).map(i => [i.to, i]));
  const items = PRIMARY_ROUTES.map(r => byRoute[r]);
  // „Więcej" świeci, gdy jesteśmy na stronie spoza czwórki (np. Kalendarz) —
  // inaczej pasek nie pokazywałby, gdzie użytkownik jest.
  const moreActive = moreOpen || !PRIMARY_ROUTES.some(r => isActiveRoute(r, pathname));

  // Zmienna --tabbar-h (index.css) podnosi toasty, komunikat o aktualizacji
  // i dolny margines treści nad pasek, tylko gdy pasek faktycznie jest.
  useEffect(() => {
    document.documentElement.classList.add('has-tabbar');
    return () => document.documentElement.classList.remove('has-tabbar');
  }, []);

  return (
    <nav
      aria-label={t('nav_section_main')}
      className="fixed inset-x-0 bottom-0 z-[150] border-t border-line bg-bg-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
    >
      <div className="grid h-[58px] grid-cols-5">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => cx(itemClass, isActive && !moreOpen ? 'text-fg' : 'text-faint')}
          >
            {({ isActive }) => (
              <>
                <span className={pillClass(isActive && !moreOpen)}>{item.icon}</span>
                <span className="max-w-full truncate px-1">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onMore}
          aria-expanded={moreOpen}
          className={cx(itemClass, moreActive ? 'text-fg' : 'text-faint')}
        >
          <span className={pillClass(moreActive)}><Ellipsis size={18} aria-hidden /></span>
          <span>{t('nav_more')}</span>
        </button>
      </div>
    </nav>
  );
}
