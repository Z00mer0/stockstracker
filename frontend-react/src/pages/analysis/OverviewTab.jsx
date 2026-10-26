import { useMemo, useState } from 'react';
import { Layers, TrendingUp, TrendingDown, Percent, TriangleAlert, Sparkles, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usePrivacy } from '../../context/PrivacyContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import TickerLogo from '../../components/shared/TickerLogo';
import { Card, SegmentedControl, Stat, Table } from '../../components/ui';
import { attribution } from '../../utils/attribution.js';
import { useHistoricalFx } from '../../hooks/useHistoricalFx.js';
import { cx } from '../../components/ui/cx.js';
import { buildInsights } from './insights.js';

const INSIGHT_TONE = {
  warn: { box: 'border-[color-mix(in_oklab,var(--warn),transparent_55%)] bg-warn-soft', icon: TriangleAlert, iconClass: 'text-warn' },
  up:   { box: 'border-[color-mix(in_oklab,var(--up),transparent_55%)] bg-up-soft', icon: TrendingUp, iconClass: 'text-up' },
  down: { box: 'border-[color-mix(in_oklab,var(--down),transparent_55%)] bg-down-soft', icon: TrendingDown, iconClass: 'text-down' },
  info: { box: 'border-line bg-panel-2', icon: Info, iconClass: 'text-dim' },
};

export default function OverviewTab({ enriched, positionsCount, realizedYtdPLN, taxable }) {
  const t = useT();
  const { locale } = useLanguage();
  const { isPrivate } = usePrivacy();
  const { displayCurrency, fxRates, transactions = [] } = useApp();
  const [attrBy, setAttrBy] = useState('positions');
  const histFx = useHistoricalFx(transactions);
  const attr = useMemo(() => attribution(enriched, transactions, fxRates, histFx), [enriched, transactions, fxRates, histFx]);
  const dispFx = fxRates[displayCurrency] ?? 1;
  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const fmt = (n, d = 0) => (n == null || isNaN(n) ? '—' : n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d }));

  const withReturn = useMemo(() => enriched
    .filter(p => p.costPLN > 0)
    .map(p => ({ ...p, returnPct: (p.plPLN ?? 0) / p.costPLN * 100 })), [enriched]);
  const byReturn = [...withReturn].sort((a, b) => b.returnPct - a.returnPct);
  const best5 = byReturn.slice(0, 5);
  const worst5 = [...byReturn].reverse().slice(0, 5);
  // Ważony kosztem: zwykła średnia liczyła pozycję za 500 zł tak samo jak
  // tę za 50 000 zł.
  const costSum = withReturn.reduce((s, p) => s + p.costPLN, 0);
  const avgReturn = costSum > 0 ? withReturn.reduce((s, p) => s + (p.plPLN ?? 0), 0) / costSum * 100 : null;
  const profitable = withReturn.filter(p => (p.plPLN ?? 0) >= 0).length;
  const losing = withReturn.filter(p => (p.plPLN ?? 0) < 0).length;

  const insights = useMemo(() => buildInsights(
    enriched.map(p => ({ ...p, pnlPLN: p.plPLN ?? 0, pnlPct: p.costPLN > 0 ? ((p.plPLN ?? 0) / p.costPLN) * 100 : 0 })),
    { t, locale, realizedYtdPLN, taxable },
  ), [enriched, t, locale, realizedYtdPLN, taxable]);

  const blur = isPrivate ? 'privacy-blur' : undefined;
  const sign = v => (v >= 0 ? '+' : '');
  const perfColumns = [
    {
      key: 'symbol', header: t('col_symbol'), mobile: 'title',
      render: p => <span className="flex items-center gap-2"><TickerLogo symbol={p.symbol} /><span className="font-semibold text-fg">{p.symbol}</span></span>,
    },
    {
      key: 'plPLN', header: 'P&L', align: 'right', sortable: true, firstDir: 'desc',
      render: p => <span className={cx((p.plPLN ?? 0) >= 0 ? 'text-up' : 'text-down', blur)}>{sign(p.plPLN ?? 0)}{fmt((p.plPLN ?? 0) / dispFx)} {currLabel}</span>,
    },
    {
      // Procent bez dzielenia przez kurs waluty wyświetlania — wcześniej przy
      // widoku w USD +10% pokazywało się jako +2,5%.
      key: 'returnPct', header: t('col_return'), align: 'right', sortable: true, firstDir: 'desc', mobile: 'aside',
      render: p => <span className={cx('font-semibold', p.returnPct >= 0 ? 'text-up' : 'text-down')}>{sign(p.returnPct)}{fmt(p.returnPct, 1)}%</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Layers} label={t('num_positions')} value={positionsCount} />
        <Stat icon={TrendingUp} label={t('profitable')} value={profitable} tone="up" />
        <Stat icon={TrendingDown} label={t('losing')} value={losing} tone="down" />
        <Stat
          icon={Percent}
          label={t('avg_return')}
          value={avgReturn != null ? `${sign(avgReturn)}${fmt(avgReturn, 1)}%` : '—'}
          tone={avgReturn == null ? undefined : avgReturn >= 0 ? 'up' : 'down'}
        />
      </div>

      {/* Przy ≤ 10 pozycjach „najlepsze 5" i „najgorsze 5" to te same spółki
          w odwrotnej kolejności — wtedy jedna posortowana lista. */}
      {byReturn.length > 10 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title={t('best_positions')}>
            <Table columns={perfColumns} rows={best5} rowKey={p => p.id ?? p.symbol} />
          </Card>
          <Card title={t('worst_positions')}>
            <Table columns={perfColumns} rows={worst5} rowKey={p => p.id ?? p.symbol} />
          </Card>
        </div>
      ) : (
        <Card title={t('positions_by_return')}>
          <Table columns={perfColumns} rows={byReturn} rowKey={p => p.id ?? p.symbol} defaultSort={{ key: 'returnPct', dir: 'desc' }} />
        </Card>
      )}

      {attr.positions.length > 0 && (() => {
        const items = attrBy === 'positions'
          ? attr.positions.map(r => ({ key: r.symbol, label: r.symbol, total: r.total, parts: r }))
          : attr.sectors.map(r => ({ key: r.sector || '-', label: r.sector || t('attr_no_sector'), total: r.total }));
        const maxAbs = Math.max(...items.map(i => Math.abs(i.total)), 1);
        return (
          <Card
            title={t('attr_title')}
            actions={<SegmentedControl aria-label={t('attr_title')} options={[{ value: 'positions', label: t('attr_by_positions') }, { value: 'sectors', label: t('attr_by_sectors') }]} value={attrBy} onChange={setAttrBy} />}
          >
            <div className="grid gap-2 px-4 py-3">
              <p className="text-[11px] text-faint">{t('attr_desc')}</p>
              {items.map(i => (
                <div key={i.key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3 text-small">
                  <span className="truncate font-semibold text-fg">{i.label}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-panel-2" aria-hidden>
                    <span className={cx('block h-full rounded-full', i.total >= 0 ? 'bg-up' : 'bg-down')} style={{ width: `${Math.abs(i.total) / maxAbs * 100}%` }} />
                  </span>
                  <span
                    className={cx('text-right tabular-nums font-semibold', i.total >= 0 ? 'text-up' : 'text-down', blur)}
                    title={i.parts ? `${t('attr_unrealized')} ${fmt(i.parts.unrealized / dispFx)} · ${t('attr_realized')} ${fmt(i.parts.realized / dispFx)} · ${t('attr_dividends')} ${fmt(i.parts.dividends / dispFx)} ${currLabel}` : undefined}
                  >
                    {sign(i.total)}{fmt(i.total / dispFx)} {currLabel}
                    {attr.total > 0 && <span className="ml-1.5 font-normal text-faint">{fmt(i.total / attr.total * 100, 0)}%</span>}
                  </span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-line pt-2 text-small">
                <span className="text-dim">{t('attr_total')}</span>
                <span className={cx('font-semibold tabular-nums', attr.total >= 0 ? 'text-up' : 'text-down', blur)}>{sign(attr.total)}{fmt(attr.total / dispFx)} {currLabel}</span>
              </div>
            </div>
          </Card>
        );
      })()}

      {insights.length > 0 && (
        <Card title={<span className="inline-flex items-center gap-2"><Sparkles size={15} aria-hidden className="text-accent-text" />{t('smart_insights')}</span>}>
          <div className="grid gap-3 p-4">
            <p className="text-small text-faint">{t('smart_insights_sub')}</p>
            {insights.map((ins, i) => {
              const tone = INSIGHT_TONE[ins.kind] ?? INSIGHT_TONE.info;
              const Icon = tone.icon;
              return (
                <div key={i} className={cx('rounded-card-sm border px-4 py-3', tone.box)}>
                  <div className="mb-1.5 flex items-center gap-2 text-[14px] font-semibold text-fg">
                    <Icon size={15} aria-hidden className={tone.iconClass} />
                    {ins.title}
                  </div>
                  <div className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-dim">{ins.lines.join('\n')}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
