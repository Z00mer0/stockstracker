// src/pages/ClosedPositions.jsx
import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Scale, Hash, Download, Search, BookOpen, Archive } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import { usePrivacy } from '../context/PrivacyContext';
import TickerLogo from '../components/shared/TickerLogo';
import { PageSkeleton } from '../components/RouteFallback';
import { Button, Card, EmptyState, Input, SegmentedControl, Stat, Table } from '../components/ui';
import { cx } from '../components/ui/cx.js';
import { computeRealizedTrades, groupBySymbol, exportPIT38CSV } from '../utils/realizedPL';
import { loadJournal } from '../services/journalService';

const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };

export default function ClosedPositions() {
  const { transactions = [], loading, fxRates, displayCurrency } = useApp();
  const { locale } = useLanguage();
  const t = useT();
  const { isPrivate } = usePrivacy();
  const blur = isPrivate ? 'privacy-blur' : undefined;
  const [view, setView] = useState('symbol');
  const [filter, setFilter] = useState('');
  const [journal, setJournal] = useState(null);

  const trades = useMemo(() => computeRealizedTrades(transactions, fxRates), [transactions, fxRates]);
  const grouped = useMemo(() => groupBySymbol(trades), [trades]);

  useEffect(() => {
    loadJournal().then(setJournal).catch(() => setJournal({ theses: {}, retros: {} }));
  }, []);

  // Skuteczność decyzji z tezą vs bez tezy (impulsywnych), per rok
  const journalStats = useMemo(() => {
    if (!journal || !trades.length) return null;
    const retros = journal.retros || {};
    const verdictCounts = { hit: 0, partial: 0, miss: 0 };
    Object.values(retros).forEach(r => { if (r.verdict in verdictCounts) verdictCounts[r.verdict]++; });
    const byYear = {};
    for (const tr of trades) {
      const y = tr.date?.slice(0, 4) || '—';
      if (!byYear[y]) byYear[y] = { year: y, thesis: { n: 0, pctSum: 0 }, impulse: { n: 0, pctSum: 0 } };
      const g = retros[tr.id]?.hadThesis ? byYear[y].thesis : byYear[y].impulse;
      g.n++; g.pctSum += tr.pct;
    }
    const years = Object.values(byYear).sort((a, b) => b.year.localeCompare(a.year));
    return { years, verdictCounts, hasThesisData: years.some(y => y.thesis.n > 0) };
  }, [journal, trades]);

  if (loading && !transactions.length) return <PageSkeleton />;

  const currSym = CUR_SYMBOLS[displayCurrency] ?? displayCurrency;
  const rate = fxRates[displayCurrency] ?? 1;
  const toDisp = pln => pln / rate;
  const fmt = (n, d = 2) => (n == null || isNaN(n) ? '—' : n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d }));
  const signed = (v, suffix = '') => <span className={cx('font-semibold', v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-faint')}>{v > 0 ? '+' : ''}{fmt(v)}{suffix}</span>;
  const qty = q => fmt(q, q % 1 === 0 ? 0 : 4);
  const cur = c => <span className="text-[11px] text-faint"> {CUR_SYMBOLS[c] ?? c}</span>;

  const gain = trades.filter(x => x.plPLN > 0).reduce((s, x) => s + x.plPLN, 0);
  const loss = trades.filter(x => x.plPLN < 0).reduce((s, x) => s + x.plPLN, 0);
  const net = gain + loss;

  const q = filter.trim().toUpperCase();
  const rows = view === 'symbol'
    ? grouped.filter(g => !q || g.symbol.toUpperCase().includes(q)).map(g => ({ ...g, n: g.trades.length }))
    : trades.filter(x => !q || x.symbol.toUpperCase().includes(q));

  const symbolCol = {
    key: 'symbol', header: t('col_symbol'), sortable: true, mobile: 'title',
    render: r => <span className="flex items-center gap-2"><TickerLogo symbol={r.symbol} size={24} /><span className="font-semibold text-accent-text">{r.symbol}</span></span>,
  };
  const plCol = { key: 'plPLN', header: `P&L (${currSym})`, align: 'right', sortable: true, firstDir: 'desc', mobile: 'aside', render: r => <span className={blur}>{signed(toDisp(r.plPLN))}</span> };
  const pctCol = { key: 'pct', header: 'P&L %', align: 'right', sortable: true, firstDir: 'desc', render: r => <span className={blur}>{signed(r.pct, '%')}</span> };
  const columns = view === 'symbol'
    ? [
      symbolCol,
      { key: 'n', header: t('trades_count'), align: 'right', sortable: true, firstDir: 'desc', render: r => <span className="text-dim">{r.n}</span> },
      { key: 'totalQty', header: t('total_qty'), align: 'right', sortable: true, firstDir: 'desc', render: r => <span className={blur}>{qty(r.totalQty)}</span> },
      { key: 'avgCost', header: t('avg_cost'), align: 'right', sortable: true, firstDir: 'desc', render: r => <span className={cx('text-dim', blur)}>{fmt(r.avgCost)}{cur(r.currency)}</span> },
      { key: 'avgSell', header: t('avg_sell'), align: 'right', sortable: true, firstDir: 'desc', render: r => <span className={blur}>{fmt(r.avgSell)}{cur(r.currency)}</span> },
      plCol, pctCol,
    ]
    : [
      symbolCol,
      { key: 'date', header: t('col_date'), sortable: true, firstDir: 'desc', render: r => <span className="text-xs text-dim">{r.date}</span> },
      { key: 'qty', header: t('qty_short'), align: 'right', sortable: true, firstDir: 'desc', render: r => <span className={blur}>{qty(r.qty)}</span> },
      { key: 'costBasis', header: t('avg_cost'), align: 'right', sortable: true, firstDir: 'desc', render: r => <span className={cx('text-dim', blur)}>{fmt(r.costBasis)}{cur(r.currency)}</span> },
      { key: 'sellPrice', header: t('col_price'), align: 'right', sortable: true, firstDir: 'desc', render: r => <span className={blur}>{fmt(r.sellPrice)}{cur(r.currency)}</span> },
      plCol, pctCol,
    ];

  function downloadCSV() {
    const blob = new Blob([exportPIT38CSV(trades, fxRates, locale)], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pit38_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const journalCell = g => (g.n === 0 ? <span className="text-faint">—</span> : (
    <span>{signed(g.pctSum / g.n, '%')}<span className="text-[11px] text-faint"> ({g.n} {t('journal_trades_unit')})</span></span>
  ));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" icon={Download} disabled={!trades.length} onClick={downloadCSV}>{t('export_pit38')}</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat blur={isPrivate} icon={TrendingUp} tone="up" label={t('realized_gain')} value={`+${fmt(toDisp(gain))} ${currSym}`} />
        <Stat blur={isPrivate} icon={TrendingDown} tone="down" label={t('realized_loss')} value={`${fmt(toDisp(loss))} ${currSym}`} />
        <Stat blur={isPrivate} icon={Scale} tone={net >= 0 ? 'up' : 'down'} label={t('net_realized_pl')} value={`${net >= 0 ? '+' : ''}${fmt(toDisp(net))} ${currSym}`} />
        <Stat icon={Hash} label={t('closed_trades_count')} value={trades.length} />
      </div>

      {trades.length === 0 && <EmptyState icon={Archive} title={t('no_closed_positions')} />}

      {journalStats && (
        <Card title={<span className="inline-flex items-center gap-2"><BookOpen size={15} aria-hidden className="text-accent-text" />{t('journal_stats_title')}</span>} collapsible collapseKey="cp_journal">
          {journalStats.hasThesisData ? (
            <>
              <div className="flex flex-wrap gap-4 px-4 pt-3 text-small text-dim">
                <span>{t('journal_hit')}: <b className="text-up">{journalStats.verdictCounts.hit}</b></span>
                <span>{t('journal_partial')}: <b className="text-warn">{journalStats.verdictCounts.partial}</b></span>
                <span>{t('journal_miss')}: <b className="text-down">{journalStats.verdictCounts.miss}</b></span>
              </div>
              <Table
                columns={[
                  { key: 'year', header: t('journal_year_col'), mobile: 'title', render: y => <span className="font-semibold text-fg">{y.year}</span> },
                  { key: 'thesis', header: t('journal_with_thesis'), align: 'right', render: y => journalCell(y.thesis) },
                  { key: 'impulse', header: t('journal_without_thesis'), align: 'right', render: y => journalCell(y.impulse) },
                ]}
                rows={journalStats.years}
                rowKey={y => y.year}
              />
              <p className="px-4 pb-3 pt-2 text-[11px] text-faint">{t('journal_stats_note')}</p>
            </>
          ) : <p className="p-4 text-small text-faint">{t('journal_stats_empty')}</p>}
        </Card>
      )}

      {trades.length > 0 && (
        <Card
          title={t('closed_positions_title')}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Input icon={Search} aria-label={t('col_symbol')} placeholder={`${t('col_symbol')}…`} value={filter} onChange={e => setFilter(e.target.value)} className="w-36" />
              <SegmentedControl
                options={[{ value: 'symbol', label: t('group_by_symbol') }, { value: 'trade', label: t('by_trade') }]}
                value={view}
                onChange={setView}
              />
            </div>
          )}
        >
          <Table
            key={view}
            columns={columns}
            rows={rows}
            rowKey={r => (view === 'symbol' ? r.symbol : r.id)}
            defaultSort={{ key: 'plPLN', dir: 'desc' }}
            pageSize={50}
          />
          <p className="border-t border-line px-4 py-2.5 text-[11px] text-faint">{t('pit38_note')}</p>
        </Card>
      )}
    </div>
  );
}
