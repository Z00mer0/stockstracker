// src/components/layout/Layout.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Suspense } from 'react';
import RouteFallback from '../RouteFallback';
import PageHeader from '../ui/PageHeader.jsx';
import ErrorBoundary from '../ErrorBoundary';
import { useT } from '../../context/LanguageContext';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import NewPortfolioModal from '../NewPortfolioModal.jsx';
import { useApp } from '../../context/AppContext';
import { lsSet } from '../../utils/safeStorage.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

const THEME_KEY = 'myfund_theme';
const COLLAPSE_KEY = 'myfund_sidebar_collapsed';

// Strony, które same nie mają nagłówka — bez tego po przejściu z menu nie było
// widać, gdzie się jest. Strony z własnym tytułem (Dashboard, AI) celowo
// tu nie występują.
const PAGE_HEADINGS = {
  '/portfolio':    ['nav_portfolio',    'page_sub_portfolio'],
  '/history':      ['nav_history',      'page_sub_history'],
  '/closed':       ['closed_positions_title', 'closed_positions_subtitle'],
  '/transactions': ['nav_transactions', 'page_sub_transactions'],
  '/dividends':    ['nav_dividends',    'page_sub_dividends'],
  '/news':         ['news_title',       'news_subtitle'],
  '/oki':          ['nav_oki',          'oki_title'],
  '/scenario':     ['nav_scenario',     'scenario_subtitle'],
  '/calendar':     ['nav_calendar',     'page_sub_calendar'],
  '/watchlist':    ['nav_watchlist',    'page_sub_watchlist'],
  '/alerts':       ['nav_alerts',       'page_sub_alerts'],
  '/analysis':     ['nav_analysis',     'page_sub_analysis'],
  '/settings':     ['nav_settings',     'page_sub_settings'],
};

export default function Layout() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Zwinięte menu to wygoda jednej przeglądarki — pamiętane lokalnie.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const [showNewPortfolio, setShowNewPortfolio] = useState(false);
  // Drugi rząd nagłówka (szukajka + status giełd) chowa się przy przewijaniu
  // w dół i wraca przy pierwszym ruchu w górę — na telefonie zjadał 45 px
  // ekranu przez cały czas czytania strony.
  const [headerCompact, setHeaderCompact] = useState(false);
  const mainRef = useRef(null);
  const lastScrollY = useRef(0);

  const { portfolios, isAuthenticated, loading, error } = useApp();
  const location = useLocation();
  const t = useT();
  const heading = PAGE_HEADINGS[location.pathname.replace(/\/$/, '')];

  // Auto-open new portfolio modal only for genuinely new users (after data loads).
  // Guard against backend errors (503/timeouts): portfolios stays [] on a failed
  // fetch, so we'd otherwise pop the "create portfolio" modal at users who already
  // have data — during a Render cold start, for example.
  useEffect(() => {
    if (isAuthenticated && !loading && !error && portfolios.length === 0) {
      setShowNewPortfolio(true);
    }
  }, [isAuthenticated, loading, error, portfolios.length]);

  useEffect(() => { lsSet(COLLAPSE_KEY, collapsed ? '1' : '0'); }, [collapsed]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    lsSet(THEME_KEY, theme);
  }, [theme]);

  // Scroll obserwujemy na <main>, nie na oknie — to on jest kontenerem
  // przewijania (okno stoi, bo html/body mają overflow: hidden).
  useEffect(() => {
    const el = mainRef.current;
    if (!el || !isMobile) { setHeaderCompact(false); return; }
    lastScrollY.current = el.scrollTop;
    function onScroll() {
      const y = el.scrollTop;
      const prev = lastScrollY.current;
      // Próg 4 px tłumi drgania z bounce'u i z reflowu po zwinięciu rzędu.
      if (y < 24) setHeaderCompact(false);
      else if (y > prev + 4) setHeaderCompact(true);
      else if (y < prev - 4) setHeaderCompact(false);
      lastScrollY.current = y;
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isMobile]);

  // Zmiana strony wraca do pełnego nagłówka — nowa treść startuje od góry.
  useEffect(() => { setHeaderCompact(false); }, [location.pathname]);

  // Szerokosc czyta teraz useIsMobile (jedno zrodlo dla calej aplikacji);
  // tutaj zostaje tylko skutek uboczny: wyjscie z mobile zamyka szuflade.
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : `${collapsed ? 68 : 232}px 1fr`,
      transition: 'grid-template-columns 0.2s ease',
      height: '100dvh',
      background: 'var(--bg)',
      color: 'var(--text)',
      overflow: 'hidden',
    }}>
      <Sidebar
        isMobile={isMobile}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        onNewPortfolio={() => setShowNewPortfolio(true)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
      />
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Nagłówek ma własną granicę i pusty fallback: pasek notowań czerpie
            z zewnętrznego API i już raz wywrócił całą aplikację ("tickers is
            not iterable"). Jego awaria ma go po prostu ukryć, nie zabierać
            użytkownikowi portfela. */}
        <ErrorBoundary name="header" fallback={null}>
          <Header
            theme={theme}
            onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            isMobile={isMobile}
            compact={headerCompact}
          />
        </ErrorBoundary>
        <main ref={mainRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: isMobile ? '16px 16px calc(var(--tabbar-h) + 28px)' : '24px 28px 60px', maxWidth: '1640px', width: '100%', margin: '0 auto', containerType: 'inline-size', containerName: 'app' }}>
          {/* Suspense tutaj, a nie wokół <Routes> — dzięki temu przy przejściu
              między stronami menu i nagłówek zostają na miejscu, a wymienia się
              tylko obszar treści. Granica błędu w tym samym miejscu i z tego
              samego powodu; resetKey na ścieżce sprawia, że wyjście na inną
              stronę czyści komunikat. */}
          <ErrorBoundary
            name="page"
            resetKey={location.pathname}
            title={t('page_error')}
            hint={t('page_error_hint')}
          >
            {/* key na ścieżce: każda strona dostaje świeżą granicę Suspense.
                Router przełącza trasy w startTransition, a wtedy React trzyma
                na ekranie starą stronę, dopóki nie dojdzie kod nowej — na
                wolnym łączu stuknięcie w zakładkę przez 2 s nic nie zmieniało,
                nawet podświetlenie w dolnym pasku. Nowa granica pokazuje
                szkielet od razu (po 180 ms, patrz RouteFallback). */}
            <Suspense key={location.pathname} fallback={<RouteFallback />}>
              {heading && <PageHeader title={t(heading[0])} subtitle={t(heading[1])} />}
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      {isMobile && <BottomNav onMore={() => setSidebarOpen(o => !o)} moreOpen={sidebarOpen} />}
      {showNewPortfolio && <NewPortfolioModal onClose={() => setShowNewPortfolio(false)} />}
    </div>
  );
}
