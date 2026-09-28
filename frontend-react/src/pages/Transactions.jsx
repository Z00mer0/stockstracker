// src/pages/Transactions.jsx
import { useMemo, useState } from 'react';
import { ShoppingCart, HandCoins, Coins, Wallet, Download, Upload, Plus, ArrowLeftRight, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useLanguage, useT } from '../context/LanguageContext';
import TickerLogo from '../components/shared/TickerLogo';
import { PageSkeleton } from '../components/RouteFallback';
import { Badge, Button, Callout, Card, EmptyState, Stat, Table, Tabs, TabPanel } from '../components/ui';
import { normalizeType, txAmount, last30Totals } from '../utils/transactions.js';
import { exportTransactions } from '../utils/exporters.js';
import AddTransactionModal from './transactions/AddTransactionModal.jsx';
import ImportCsvModal from './transactions/ImportCsvModal.jsx';

const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };
const TYPE_TONE = { BUY: 'up', SELL: 'down', DIV: 'info', CASH: 'warn' };
const TYPE_LABEL = { BUY: 'type_buy', SELL: 'type_sell', DIV: 'type_div', CASH: 'type_cash', SPLIT: 'tx_type_split' };

function fmtDate(d, locale) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmt(n, decimals, locale) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function Transactions() {
  const { transactions = [], loading, saveTransactions, activePortfolioId, displayCurrency, fxRates, canWrite } = useApp();
  const { isPrivate } = usePrivacy();
  const { locale } = useLanguage();
  const t = useT();
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const stats = useMemo(() => last30Totals(transactions, fxRates, displayCurrency), [transactions, fxRates, displayCurrency]);

  const counts = useMemo(() => {
    const c = { BUY: 0, SELL: 0, DIV: 0, CASH: 0 };
    for (const tx of transactions) { const k = normalizeType(tx.type); if (k in c) c[k]++; }
    return c;
  }, [transactions]);

  // Najnowsze na górze; brak daty na końcu (wcześniej brak daty wywracał sort).
  const sorted = useMemo(() => {
    const base = filter === 'all' ? transactions : transactions.filter(tx => normalizeType(tx.type) === filter);
    return [...base].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [transactions, filter]);

  if (loading && !transactions.length) return <PageSkeleton />;

  const tabs = [
    { value: 'all', label: t('nav_all'), count: transactions.length },
    { value: 'BUY', label: t('type_buy'), count: counts.BUY },
    { value: 'SELL', label: t('type_sell'), count: counts.SELL },
    { value: 'DIV', label: t('nav_dividends'), count: counts.DIV },
    { value: 'CASH', label: t('type_cash'), count: counts.CASH },
  ];

  const blur = isPrivate ? 'privacy-blur' : undefined;
  const columns = [
    {
      key: 'date', header: t('col_date'), sortable: true, firstDir: 'desc',
      render: tx => <span className="text-xs text-dim">{fmtDate(tx.date, locale)}</span>,
    },
    {
      key: 'type', header: t('col_type'), sortable: true, value: tx => normalizeType(tx.type),
      render: tx => {
        const k = normalizeType(tx.type);
        return <Badge tone={TYPE_TONE[k] ?? 'neutral'}>{TYPE_LABEL[k] ? t(TYPE_LABEL[k]) : k}</Badge>;
      },
    },
    {
      key: 'symbol', header: t('col_symbol'), sortable: true, mobile: 'title',
      render: tx => (
        <span className="flex min-w-0 items-center gap-2">
          {tx.symbol
            ? <TickerLogo symbol={tx.symbol} />
            : <span className="ticker-logo" aria-hidden><Wallet size={14} /></span>}
          <span className="text-[13px] font-semibold text-fg">{tx.symbol || (normalizeType(tx.type) === 'CASH' ? t('type_cash') : '—')}</span>
          {tx.name && tx.name !== tx.symbol && <span className="truncate text-[11px] font-normal text-faint">{tx.name}</span>}
          {activePortfolioId === 'all' && tx._portfolioName && <Badge>{tx._portfolioName}</Badge>}
        </span>
      ),
    },
    {
      key: 'qty', header: t('qty_short'), align: 'right', sortable: true, firstDir: 'desc',
      render: tx => (tx.ratio > 0 ? `×${fmt(tx.ratio, tx.ratio % 1 === 0 ? 0 : 4, locale)}` : tx.qty != null ? fmt(tx.qty, tx.qty % 1 === 0 ? 0 : 4, locale) : '—'),
    },
    {
      key: 'price', header: t('price_label'), align: 'right',
      render: tx => <span className={`text-dim ${blur ?? ''}`}>{tx.price != null ? `${fmt(tx.price, 2, locale)} ${CUR_SYMBOLS[tx.currency] ?? tx.currency ?? ''}` : '—'}</span>,
    },
    {
      // Kwota w walucie transakcji, ale sortowanie po wartości w PLN —
      // inaczej 100 $ stało obok 100 zł jak równa kwota.
      key: 'value', header: t('col_value'), align: 'right', sortable: true, firstDir: 'desc', mobile: 'aside',
      value: tx => txAmount(tx) * (fxRates[tx.currency] ?? 1),
      render: tx => <span className={`font-semibold ${blur ?? ''}`}>{fmt(txAmount(tx), 2, locale)} {CUR_SYMBOLS[tx.currency] ?? tx.currency ?? ''}</span>,
    },
    { key: 'note', header: t('col_note'), render: tx => <span className="text-[11px] text-faint">{tx.note || '—'}</span> },
  ];

  const empty = (
    <EmptyState
      icon={ArrowLeftRight}
      title={filter === 'all' ? t('tx_empty_title') : t('tx_empty_filtered')}
      description={filter === 'all' ? t('tx_empty_hint') : undefined}
      action={filter === 'all' && canWrite && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" icon={Plus} onClick={() => setShowAdd(true)}>{t('add_transaction_title')}</Button>
          <Button icon={Upload} onClick={() => setShowImport(true)}>{t('tx_import_csv')}</Button>
        </div>
      )}
    />
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat blur={isPrivate} icon={ShoppingCart} label={t('buys_30d')} value={`${fmt(stats.buy, 2, locale)} ${currLabel}`} />
        <Stat blur={isPrivate} icon={HandCoins} label={t('sells_30d')} value={`${fmt(stats.sell, 2, locale)} ${currLabel}`} />
        <Stat blur={isPrivate} icon={Coins} label={t('divs_30d')} value={`${fmt(stats.div, 2, locale)} ${currLabel}`} />
        <Stat blur={isPrivate} icon={Wallet} label={t('cash_30d')} value={`${fmt(stats.cash, 2, locale)} ${currLabel}`} />
      </div>

      {/* W widoku „Wszystkie" zapis i tak jest zablokowany (AppContext) —
          wcześniej użytkownik dowiadywał się o tym dopiero po wypełnieniu
          formularza. */}
      {!canWrite && <Callout tone="info" icon={Info}>{t('tx_pick_portfolio')}</Callout>}

      <Card
        title={`${t('transactions_label')} · ${sorted.length}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={Download} disabled={!sorted.length} onClick={() => exportTransactions(sorted, t, 'csv')}>{t('tx_export_csv')}</Button>
            <Button size="sm" icon={Upload} disabled={!canWrite} title={canWrite ? undefined : t('tx_pick_portfolio')} onClick={() => setShowImport(true)}>{t('tx_import_csv')}</Button>
            <Button size="sm" variant="primary" icon={Plus} disabled={!canWrite} title={canWrite ? undefined : t('tx_pick_portfolio')} onClick={() => setShowAdd(true)}>{t('add')}</Button>
          </div>
        }
      >
        <div className="px-4 pt-2">
          <Tabs id="tx" tabs={tabs} value={filter} onChange={setFilter} />
        </div>
        <TabPanel tabsId="tx" value={filter}>
        <Table
          columns={columns}
          rows={sorted}
          rowKey={tx => tx.id ?? `${tx.date}|${tx.type}|${tx.symbol}|${tx.qty}|${tx.price}`}
          defaultSort={{ key: 'date', dir: 'desc' }}
          pageSize={50}
          empty={empty}
        />
        </TabPanel>
      </Card>

      {showAdd && (
        <AddTransactionModal
          onSave={async tx => { await saveTransactions(prev => [...prev, tx]); }}
          onClose={() => setShowAdd(false)}
        />
      )}
      {showImport && (
        <ImportCsvModal
          existingTransactions={transactions}
          onSave={saveTransactions}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
