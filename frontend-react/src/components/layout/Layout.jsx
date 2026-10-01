// src/components/layout/Layout.jsx
import { lazy, useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Suspense } from 'react';
import RouteFallback from '../RouteFallback';
import PageHeader from '../ui/PageHeader.jsx';
import ErrorBoundary from '../ErrorBoundary';
import { useT } from '../../context/LanguageContext';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import OfflineBanner from './OfflineBanner.jsx';
import NewPortfolioModal from '../NewPortfolioModal.jsx';
import { wizardPending, WIZARD_DONE_EVENT } from '../SetupWizard.jsx';
import { useApp } from '../../context/AppContext';
import { lsSet } from '../../utils/safeStorage.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

// Paleta ⌘K i okna, które z niej otwieramy — dociągane dopiero przy użyciu.
const CommandPalette = lazy(() => import('../CommandPalette.jsx'));
const StockDetailModal = lazy(() => import('../StockDetailModal.jsx'));
const AddStockModal = lazy(() => import('../AddStockModal.jsx'));

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

  const { portfolios, isAuthenticated, loading, error, portfolio, addPosition, refresh } = useApp();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteStock, setPaletteStock] = useState(null);
  const [paletteAdd, setPaletteAdd] = useState(false);

  // ⌘K / Ctrl+K — paleta poleceń (wcześniej tylko fokus na wyszukiwarce).
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    const onOpen = () => setPaletteOpen(true);
    window.addEventListener('myfund-open-palette', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('myfund-open-palette', onOpen); };
  }, []);
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();

  // Skróty z ikony aplikacji na telefonie (manifest → shortcuts): /?action=…
  useEffect(() => {
    const action = new URLSearchParams(location.search).get('action');
    if (!action) return;
    if (action === 'add') setPaletteAdd(true);
    else if (action === 'search') setPaletteOpen(true);
    navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate]);
  const heading = PAGE_HEADINGS[location.pathname.replace(/\/$/, '')];

  // Auto-open new portfolio modal only for genuinely new users (after data loads).
  // Guard against backend errors (503/timeouts): portfolios stays [] on a failed
  // fetch, so we'd otherwise pop the "create portfolio" modal at users who already
  // have data — during a Render cold start, for example.
  // Nowe konto: najpierw kreator powitalny, potem to okno (wybrana tam
  // waluta jest domyślną walutą portfela).
  const [wizardTick, setWizardTick] = useState(0);
  useEffect(() => {
    const onDone = () => setWizardTick(n => n + 1);
    window.addEventListener(WIZARD_DONE_EVENT, onDone);
    return () => window.removeEventListener(WIZARD_DONE_EVENT, onDone);
  }, []);
  useEffect(() => {
    if (isAuthenticated && !loading && !error && portfolios.length === 0 && !wizardPending()) {
      setShowNewPortfolio(true);
    }
  }, [isAuthenticated, loading, error, portfolios.length, wizardTick]);

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
        <OfflineBanner />
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
      <Suspense fallback={null}>
        {paletteOpen && (
          <CommandPalette
            onClose={() => setPaletteOpen(false)}
            onOpenStock={setPaletteStock}
            onAddPosition={() => setPaletteAdd(true)}
            onNewPortfolio={() => setShowNewPortfolio(true)}
            onToggleTheme={() => setTheme(th => (th === 'dark' ? 'light' : 'dark'))}
          />
        )}
        {paletteStock && (
          <StockDetailModal item={paletteStock} existingPortfolio={portfolio} onClose={() => setPaletteStock(null)} />
        )}
        {paletteAdd && (
          <AddStockModal
            existingPortfolio={portfolio}
            onSave={async data => { await addPosition(data); refresh(); }}
            onClose={() => setPaletteAdd(false)}
          />
        )}
      </Suspense>
    </div>
  );
}
