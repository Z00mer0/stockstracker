// src/pages/Analysis.jsx
// Jedenaście zwijanych sekcji jedna pod drugą zamienione na pięć zakładek.
// Tu tylko dane wspólne i przełącznik; sekcje w pages/analysis/*.
import { useMemo, useState } from 'react';
import { ChartPie } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useT } from '../context/LanguageContext';
import { usePortfolioMetrics } from '../hooks/usePortfolioMetrics';
import { PageSkeleton } from '../components/RouteFallback';
import { EmptyState, Tabs, TabPanel } from '../components/ui';
import { computeRealizedTrades } from '../utils/realizedPL';
import { lsSet } from '../utils/safeStorage.js';
import OverviewTab from './analysis/OverviewTab.jsx';
import AllocationTab from './analysis/AllocationTab.jsx';
import RiskTab from './analysis/RiskTab.jsx';
import TaxTab from './analysis/TaxTab.jsx';
import FireTab from './analysis/FireTab.jsx';

const TAB_KEY = 'myfund_analysis_tab';
const TABS = ['overview', 'allocation', 'risk', 'tax', 'fire'];

function loadTab() {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return TABS.includes(v) ? v : 'overview';
  } catch { return 'overview'; }
}

export default function Analysis() {
  const { portfolio, transactions, fxRates, loading, activePortfolio } = useApp();
  const t = useT();
  const [tab, setTab] = useState(loadTab);
  const { enrichPosition } = usePortfolioMetrics(portfolio, transactions, fxRates);

  const enriched = useMemo(
    () => portfolio.map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );
  const totalValue = enriched.reduce((s, p) => s + (p.valuePLN ?? 0), 0);

  // Zrealizowany wynik w tym roku — wspólny dla zakładki Podatki i wniosków.
  const realizedYtdPLN = useMemo(() => {
    const jan1 = `${new Date().getFullYear()}-01-01`;
    return computeRealizedTrades(transactions, fxRates)
      .filter(tr => tr.date >= jan1)
      .reduce((s, tr) => s + tr.plPLN, 0);
  }, [transactions, fxRates]);
  const accountType = activePortfolio?.accountType;
  const taxable = accountType !== 'IKE' && accountType !== 'IKZE';

  if (loading && !portfolio.length) return <PageSkeleton />;
  if (!portfolio.length) return <EmptyState icon={ChartPie} title={t('no_portfolio_data')} className="py-16" />;

  const tabs = [
    { value: 'overview', label: t('an_tab_overview') },
    { value: 'allocation', label: t('an_tab_allocation') },
    { value: 'risk', label: t('an_tab_risk') },
    { value: 'tax', label: t('an_tab_tax') },
    { value: 'fire', label: 'FIRE' },
  ];

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Tabs id="an" tabs={tabs} value={tab} onChange={v => { setTab(v); lsSet(TAB_KEY, v); }} />
      </div>
      <TabPanel tabsId="an" value={tab}>
        {tab === 'overview' && <OverviewTab enriched={enriched} positionsCount={portfolio.length} realizedYtdPLN={realizedYtdPLN} taxable={taxable} />}
        {tab === 'allocation' && <AllocationTab enriched={enriched} totalValue={totalValue} />}
        {tab === 'risk' && <RiskTab enriched={enriched} />}
        {tab === 'tax' && <TaxTab enriched={enriched} realizedYtdPLN={realizedYtdPLN} accountType={accountType} />}
        {tab === 'fire' && <FireTab totalValue={totalValue} />}
      </TabPanel>
    </div>
  );
}
