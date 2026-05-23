// src/components/layout/Layout.jsx
import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const THEME_KEY = 'myfund_theme';

export default function Layout() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', localStorage.getItem(THEME_KEY) || 'dark');
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '232px 1fr', height: '100vh', background: 'var(--bg)', color: 'var(--text)', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header theme={theme} onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 60px', maxWidth: '1640px', width: '100%' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
