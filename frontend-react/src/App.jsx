import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ChartProvider } from './context/ChartContext';
import Layout from './components/layout/Layout';
import AuthGate from './components/auth/AuthGate';
import UpdatePrompt from './components/UpdatePrompt';
import SetupWizard, { shouldShowWizard } from './components/SetupWizard';
import RouteFallback from './components/RouteFallback';
import ErrorBoundary from './components/ErrorBoundary';

// Strony ładowane na żądanie. Wcześniej wszystkie 15 siedziało w jednej paczce
// ~2 MB, którą przeglądarka musiała ściągnąć i sparsować, zanim pokazała
// cokolwiek — łącznie z ekranem logowania. Teraz wejście ciągnie tylko trasę,
// na której użytkownik faktycznie jest.
const Dashboard       = React.lazy(() => import('./pages/Dashboard'));
const Portfolio       = React.lazy(() => import('./pages/Portfolio'));
const History         = React.lazy(() => import('./pages/History'));
const Transactions    = React.lazy(() => import('./pages/Transactions'));
const Dividends       = React.lazy(() => import('./pages/Dividends'));
const Calendar        = React.lazy(() => import('./pages/Calendar'));
const Watchlist       = React.lazy(() => import('./pages/Watchlist'));
const Alerts          = React.lazy(() => import('./pages/Alerts'));
const ScenarioLab     = React.lazy(() => import('./pages/ScenarioLab'));
const Analysis        = React.lazy(() => import('./pages/Analysis'));
const AiInsights      = React.lazy(() => import('./pages/AiInsights'));
const News            = React.lazy(() => import('./pages/News'));
const ClosedPositions = React.lazy(() => import('./pages/ClosedPositions'));
const Settings        = React.lazy(() => import('./pages/Settings'));
const SharedPortfolio = React.lazy(() => import('./pages/SharedPortfolio'));

function AppRoutes() {
  const { isAuthenticated, login, portfolio } = useApp();
  const [wizardDone, setWizardDone] = React.useState(false);
  const location = useLocation();

  // Publiczny widok udostępnionego portfela — bez logowania
  if (location.pathname.startsWith('/s/')) {
    return (
      <React.Suspense fallback={<RouteFallback />}>
        <ErrorBoundary name="shared">
          <Routes>
            <Route path="/s/:token" element={<SharedPortfolio />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </React.Suspense>
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
      {/* Ostatnia deska ratunku — łapie też awarie samych kontekstów. Celowo
          bez tłumaczeń: jeśli wywalił się AppProvider, to i warstwa
          językowa może być niesprawna. */}
      <ErrorBoundary name="root">
        <AppProvider>
          <ChartProvider>
            <AppRoutes />
            <UpdatePrompt />
          </ChartProvider>
        </AppProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
