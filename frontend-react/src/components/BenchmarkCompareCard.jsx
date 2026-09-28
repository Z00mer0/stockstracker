import { useLanguage, useT } from '../context/LanguageContext';
import { Card, SegmentedControl, Stat, Table } from './ui';
import { cx } from './ui/cx.js';

// „Ty vs indeks" — wynik utils/benchmarkCompare.js.
export default function BenchmarkCompareCard({ cmp, label, usdIndex, inPLN, onInPLN }) {
  const t = useT();
  const { locale } = useLanguage();
  // Znak z wartości po zaokrągleniu — bez „−0,0%".
  const signed = (v, d) => {
    const r = Number(v.toFixed(d)) || 0;
    return `${r >= 0 ? '+' : '−'}${Math.abs(r).toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  };
  const p = (v, d = 1) => (v == null ? '—' : `${signed(v, d)}%`);
  const pp = v => (v == null ? '—' : `${signed(v, 1)} ${t('bench_pp')}`);
  const tone = v => (v == null ? 'text-faint' : v >= 0 ? 'text-up' : 'text-down');
  const ahead = cmp.diff >= 0;
  const fmtDate = d => new Date(`${d}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Card
      title={t('bench_vs_title').replace('{index}', label)}
      actions={usdIndex && (
        <SegmentedControl
          options={[{ value: 'pln', label: t('bench_in_pln') }, { value: 'usd', label: 'USD' }]}
          value={inPLN ? 'pln' : 'usd'}
          onChange={v => onInPLN(v === 'pln')}
        />
      )}
    >
      <div className="grid gap-3 px-4 pb-3 pt-3">
        <p className="text-body text-fg">
          {t(ahead ? 'bench_summary_ahead' : 'bench_summary_behind')
            .replace('{from}', fmtDate(cmp.from))
            .replace('{you}', p(cmp.you))
            .replace('{index}', label)
            .replace('{bench}', p(cmp.bench))
            .replace('{diff}', pp(Math.abs(cmp.diff)).replace(/^[+−]/, ''))}
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t('bench_you')} value={p(cmp.you)} tone={cmp.you >= 0 ? 'up' : 'down'} hint={cmp.youCagr != null ? `${p(cmp.youCagr)} ${t('bench_per_year')}` : undefined} />
          <Stat label={label} value={p(cmp.bench)} tone={cmp.bench >= 0 ? 'up' : 'down'} hint={cmp.benchCagr != null ? `${p(cmp.benchCagr)} ${t('bench_per_year')}` : undefined} />
          <Stat label={t('bench_diff')} value={pp(cmp.diff)} tone={ahead ? 'up' : 'down'} hint={cmp.youCagr != null && cmp.benchCagr != null ? `${pp(cmp.youCagr - cmp.benchCagr)} ${t('bench_per_year')}` : undefined} />
        </div>
      </div>
      <Table
        columns={[
          { key: 'year', header: t('bench_year'), mobile: 'title', render: y => <span className="font-semibold text-fg">{y.year}{y.partial && <span className="ml-1 text-[11px] font-normal text-faint">({t('bench_partial')})</span>}</span> },
          { key: 'you', header: t('bench_you'), align: 'right', render: y => <span className={tone(y.you)}>{p(y.you)}</span> },
          { key: 'bench', header: label, align: 'right', render: y => <span className={tone(y.bench)}>{p(y.bench)}</span> },
          { key: 'diff', header: t('bench_diff'), align: 'right', mobile: 'aside', render: y => <span className={cx('font-semibold', tone(y.diff))}>{pp(y.diff)}</span> },
        ]}
        rows={cmp.years}
        rowKey={y => y.year}
      />
      <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-faint">
        {t('bench_note')}{usdIndex && inPLN ? ` ${t('bench_note_pln')}` : ''}
      </p>
    </Card>
  );
}
