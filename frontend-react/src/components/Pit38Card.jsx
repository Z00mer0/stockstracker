import { useMemo, useState } from 'react';
import { Download, Info, TriangleAlert } from 'lucide-react';
import { useLanguage, useT } from '../context/LanguageContext';
import { usePrivacy } from '../context/PrivacyContext';
import { usePit38 } from '../hooks/usePit38.js';
import { pit38CSV } from '../utils/pit38.js';
import { Button, Callout, Card, EmptyState, Select, Stat, Table } from './ui';
import { cx } from './ui/cx.js';

// Domyślny rok: do końca kwietnia poprzedni (sezon rozliczeń), potem bieżący.
function defaultYear(years, now = new Date()) {
  const y = now.getFullYear();
  if (now.getMonth() < 4 && years.includes(y - 1)) return y - 1;
  return years.includes(y) || !years.length ? y : years[0];
}

export default function Pit38Card() {
  const t = useT();
  const { locale } = useLanguage();
  const { isPrivate } = usePrivacy();
  const blur = isPrivate ? 'privacy-blur' : undefined;
  const [picked, setPicked] = useState(null);
  const { forYear, years: saleYears, loading } = usePit38();
  const year = picked ?? defaultYear(saleYears);
  const pit = useMemo(() => forYear(year), [forYear, year]);
  const { rows, totals } = pit;

  const fmt = (v, d = 2) => (v == null ? '—' : v.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d }));
  const years = useMemo(() => [...new Set([year, ...saleYears])].sort((a, b) => b - a), [year, saleYears]);

  function download() {
    const blob = new Blob([pit38CSV(pit)], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pit38_${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Card
      title={t('pit38_title')}
      actions={(
        <div className="flex items-center gap-2">
          <Select aria-label={t('pit38_year')} value={year} onChange={e => setPicked(Number(e.target.value))} className="w-24">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Button size="sm" variant="primary" icon={Download} disabled={!rows.length || loading} onClick={download}>CSV</Button>
        </div>
      )}
    >
      <div className="grid gap-3 px-4 pb-4 pt-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat blur={isPrivate} label={t('pit38_revenue')} value={`${fmt(totals.revenue)} zł`} />
          <Stat blur={isPrivate} label={t('pit38_cost')} value={`${fmt(totals.cost)} zł`} />
          <Stat blur={isPrivate} label={t('pit38_income')} value={`${totals.income >= 0 ? '' : '−'}${fmt(Math.abs(totals.income))} zł`} tone={totals.income >= 0 ? 'up' : 'down'} />
          <Stat blur={isPrivate} label={t('pit38_tax')} value={`${fmt(totals.tax, 0)} zł`} tone={totals.tax > 0 ? 'warn' : undefined} />
        </div>
        {loading && <p className="text-small text-faint">{t('pit38_loading_rates')}</p>}
        {!loading && totals.missingRates > 0 && (
          <Callout tone="warn" icon={TriangleAlert}>{t('pit38_missing_rates').replace('{n}', totals.missingRates)}</Callout>
        )}
        {totals.uncovered > 0 && (
          <Callout tone="warn" icon={TriangleAlert}>{t('pit38_uncovered').replace('{n}', totals.uncovered)}</Callout>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState title={t('pit38_empty').replace('{year}', year)} className="py-6" />
      ) : (
        <Table
          columns={[
            { key: 'date', header: t('col_date'), render: r => <span className="text-xs text-dim">{r.date}</span> },
            { key: 'symbol', header: t('col_symbol'), mobile: 'title', render: r => <span className="font-semibold text-fg">{r.symbol}</span> },
            { key: 'qty', header: t('qty_short'), align: 'right', render: r => <span className={blur}>{fmt(r.qty, r.qty % 1 ? 4 : 0)}</span> },
            { key: 'rate', header: t('pit38_rate'), align: 'right', render: r => <span className="text-dim">{r.currency === 'PLN' ? '—' : `${fmt(r.rate, 4)}`}</span> },
            { key: 'revenue', header: t('pit38_revenue'), align: 'right', render: r => <span className={blur}>{fmt(r.revenuePLN)}</span> },
            { key: 'cost', header: t('pit38_cost'), align: 'right', render: r => <span className={cx('text-dim', blur)}>{fmt(r.costPLN)}</span> },
            {
              key: 'gain', header: t('pit38_income'), align: 'right', mobile: 'aside',
              render: r => <span className={cx('font-semibold', r.gainPLN == null ? 'text-faint' : r.gainPLN >= 0 ? 'text-up' : 'text-down', blur)}>{fmt(r.gainPLN)}</span>,
            },
          ]}
          rows={rows}
          rowKey={r => r.id ?? `${r.symbol}-${r.date}-${r.qty}`}
          pageSize={20}
        />
      )}
      <p className="flex gap-2 border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-faint">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        <span>{t('pit38_method_note')}</span>
      </p>
    </Card>
  );
}
