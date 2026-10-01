import { useMemo } from 'react';
import { Layers, TrendingUp, TrendingDown, Percent, TriangleAlert, Sparkles, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usePrivacy } from '../../context/PrivacyContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import TickerLogo from '../../components/shared/TickerLogo';
import { Card, Stat, Table } from '../../components/ui';
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
  const { displayCurrency, fxRates } = useApp();
  const dispFx = fxRates[displayCurrency] ?? 1;
  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const fmt = (n, d = 0) => (n == null || isNaN(n) ? '—' : n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d }));

  const withReturn = useMemo(() => enriched
    .filter(p => p.costPLN > 0)
    .map(p => ({ ...p, returnPct: (p.plPLN ?? 0) / p.costPLN * 100 })), [enriched]);
  const byReturn = [...withReturn].sort((a, b) => b.returnPct - a.returnPct);
  const best5 = byReturn.slice(0, 5);
  const worst5 = [...byReturn].reverse().slice(0, 5);
  const avgReturn = withReturn.length ? withReturn.reduce((s, p) => s + p.returnPct, 0) / withReturn.length : null;
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t('best_positions')}>
          <Table columns={perfColumns} rows={best5} rowKey={p => p.id ?? p.symbol} />
        </Card>
        <Card title={t('worst_positions')}>
          <Table columns={perfColumns} rows={worst5} rowKey={p => p.id ?? p.symbol} />
        </Card>
      </div>

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
