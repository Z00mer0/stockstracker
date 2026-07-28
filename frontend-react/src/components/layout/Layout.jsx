// src/components/layout/Layout.jsx
import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Suspense } from 'react';
import RouteFallback from '../RouteFallback';
import ErrorBoundary from '../ErrorBoundary';
import { useT } from '../../context/LanguageContext';
import Sidebar from './Sidebar';
import Header from './Header';
import NewPortfolioModal from '../NewPortfolioModal.jsx';
import NotificationsTray from '../NotificationsTray.jsx';
import { useApp } from '../../context/AppContext';
import { lsSet } from '../../utils/safeStorage.js';

const THEME_KEY = 'myfund_theme';
const MOBILE_BP = 768;

export default function Layout() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BP);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNewPortfolio, setShowNewPortfolio] = useState(false);

  const { portfolios, isAuthenticated, loading, error } = useApp();
  const location = useLocation();
  const t = useT();

  // Auto-open new portfolio modal only for genuinely new users (after data loads).
  // Guard against backend errors (503/timeouts): portfolios stays [] on a failed
  // fetch, so we'd otherwise pop the "create portfolio" modal at users who already
  // have data — during a Render cold start, for example.
  useEffect(() => {
    if (isAuthenticated && !loading && !error && portfolios.length === 0) {
      setShowNewPortfolio(true);
    }
  }, [isAuthenticated, loading, error, portfolios.length]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    lsSet(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    function onResize() {
      const mobile = window.innerWidth < MOBILE_BP;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false); // auto-close drawer when going desktop
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '232px 1fr',
      height: '100dvh',
      background: 'var(--bg)',
      color: 'var(--text)',
      overflow: 'hidden',
    }}>
      <Sidebar
        isMobile={isMobile}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewPortfolio={() => setShowNewPortfolio(true)}
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
            onMenuToggle={() => setSidebarOpen(o => !o)}
          />
        </ErrorBoundary>
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: isMobile ? '16px 16px 60px' : '24px 28px 60px', maxWidth: '1640px', width: '100%', margin: '0 auto', containerType: 'inline-size', containerName: 'app' }}>
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
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      {showNewPortfolio && <NewPortfolioModal onClose={() => setShowNewPortfolio(false)} />}
      <NotificationsTray />
    </div>
  );
}
