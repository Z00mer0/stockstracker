import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/layout/Layout';
import LoginForm from './components/LoginForm';

import Dashboard    from './pages/Dashboard';
import Portfolio    from './pages/Portfolio';
import History      from './pages/History';
import Transactions from './pages/Transactions';
import Dividends    from './pages/Dividends';
import Calendar     from './pages/Calendar';
import Watchlist    from './pages/Watchlist';
import Settings     from './pages/Settings';

function AppRoutes() {
  const { isAuthenticated, login } = useApp();

  if (!isAuthenticated) {
    return <LoginForm onLogin={login} />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index              element={<Dashboard />} />
        <Route path="portfolio"   element={<Portfolio />} />
        <Route path="history"     element={<History />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="dividends"   element={<Dividends />} />
        <Route path="calendar"    element={<Calendar />} />
        <Route path="watchlist"   element={<Watchlist />} />
        <Route path="settings"    element={<Settings />} />
        <Route path="*"           element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  );
}
