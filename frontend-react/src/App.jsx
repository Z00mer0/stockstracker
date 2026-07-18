import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ChartProvider } from './context/ChartContext';
import Layout from './components/layout/Layout';
import AuthGate from './components/auth/AuthGate';
import UpdatePrompt from './components/UpdatePrompt';
import SetupWizard, { shouldShowWizard } from './components/SetupWizard';

import Dashboard    from './pages/Dashboard';
import Portfolio    from './pages/Portfolio';
import History      from './pages/History';
import Transactions from './pages/Transactions';
import Dividends    from './pages/Dividends';
import Calendar     from './pages/Calendar';
import Watchlist    from './pages/Watchlist';
import Alerts       from './pages/Alerts';
import ScenarioLab  from './pages/ScenarioLab';
import Analysis     from './pages/Analysis';
import AiInsights      from './pages/AiInsights';
import News            from './pages/News';
import ClosedPositions from './pages/ClosedPositions';
import Settings        from './pages/Settings';
import SharedPortfolio from './pages/SharedPortfolio';

function AppRoutes() {
  const { isAuthenticated, login, portfolio } = useApp();
  const [wizardDone, setWizardDone] = React.useState(false);
  const location = useLocation();

  // Publiczny widok udostępnionego portfela — bez logowania
  if (location.pathname.startsWith('/s/')) {
    return (
      <Routes>
        <Route path="/s/:token" element={<SharedPortfolio />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (!isAuthenticated) {
    return <AuthGate onLogin={login} />;
  }

  const showWizard = !wizardDone && shouldShowWizard(portfolio);

  return (
    <>
      {showWizard && <SetupWizard onDone={() => setWizardDone(true)} />}
      <Routes>
        <Route element={<Layout />}>
          <Route index              element={<Dashboard />} />
          <Route path="portfolio"   element={<Portfolio />} />
          <Route path="history"     element={<History />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="closed"      element={<ClosedPositions />} />
          <Route path="dividends"   element={<Dividends />} />
          <Route path="calendar"    element={<Calendar />} />
          <Route path="watchlist"   element={<Watchlist />} />
          <Route path="alerts"      element={<Alerts />} />
          <Route path="scenario"    element={<ScenarioLab />} />
          <Route path="analysis"    element={<Analysis />} />
          <Route path="ai"          element={<AiInsights />} />
          <Route path="news"        element={<News />} />
          <Route path="settings"    element={<Settings />} />
          <Route path="*"           element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AppProvider>
        <ChartProvider>
          <AppRoutes />
          <UpdatePrompt />
        </ChartProvider>
      </AppProvider>
    </BrowserRouter>
  );
}
