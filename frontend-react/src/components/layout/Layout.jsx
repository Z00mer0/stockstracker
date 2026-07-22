// src/components/layout/Layout.jsx
import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import NewPortfolioModal from '../NewPortfolioModal.jsx';
import { useApp } from '../../context/AppContext';

const THEME_KEY = 'myfund_theme';
const MOBILE_BP = 768;

export default function Layout() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BP);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNewPortfolio, setShowNewPortfolio] = useState(false);

  const { portfolios, isAuthenticated, loading } = useApp();

  // Auto-open new portfolio modal only for genuinely new users (after data loads)
  useEffect(() => {
    if (isAuthenticated && !loading && portfolios.length === 0) {
      setShowNewPortfolio(true);
    }
  }, [isAuthenticated, loading, portfolios.length]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
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
        <Header
          theme={theme}
          onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          isMobile={isMobile}
          onMenuToggle={() => setSidebarOpen(o => !o)}
        />
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: isMobile ? '16px 16px 60px' : '24px 28px 60px', maxWidth: '1640px', width: '100%', margin: '0 auto', containerType: 'inline-size', containerName: 'app' }}>
          <Outlet />
        </main>
      </div>
      {showNewPortfolio && <NewPortfolioModal onClose={() => setShowNewPortfolio(false)} />}
    </div>
  );
}
