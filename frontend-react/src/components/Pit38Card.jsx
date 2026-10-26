import { useMemo, useState } from 'react';
import { Download, Info, TriangleAlert } from 'lucide-react';
import { useLanguage, useT } from '../context/LanguageContext';
import { usePrivacy } from '../context/PrivacyContext';
import { usePit38, loadPit38Basis, PIT38_BASIS_KEY } from '../hooks/usePit38.js';
import { lsSet } from '../utils/safeStorage.js';
import { pit38CSV, lossCarryForward } from '../utils/pit38.js';
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
  const [basis, setBasis] = useState(loadPit38Basis);
  const { forYear, years: saleYears, loading } = usePit38(basis);
  const year = picked ?? defaultYear(saleYears);
  const pit = useMemo(() => forYear(year), [forYear, year]);
  const { rows, totals, crypto, dividends } = pit;
  const hasCrypto = crypto.sales > 0 || crypto.cost > 0 || crypto.carriedIn > 0;
  const hasDivs = dividends.count > 0;
  // Straty z poprzednich lat widoczne w aplikacji — odliczenie w wybranym roku.
  const carry = useMemo(
    () => lossCarryForward(Object.fromEntries(saleYears.map(y => [y, forYear(y).totals.income])), year),
    [forYear, saleYears, year],
  );
  const taxAfter = carry.deduction > 0 ? carry.tax : totals.tax;
  const taxAll = taxAfter + crypto.tax + dividends.due;

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
          <Select aria-label={t('pit38_basis')} value={basis} onChange={e => { setBasis(e.target.value); lsSet(PIT38_BASIS_KEY, e.target.value); }} className="w-40">
            <option value="settlement">{t('pit38_basis_settlement')}</option>
            <option value="trade">{t('pit38_basis_trade')}</option>
          </Select>
          <Select aria-label={t('pit38_year')} value={year} onChange={e => setPicked(Number(e.target.value))} className="w-24">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Button size="sm" variant="primary" icon={Download} disabled={(!rows.length && !hasCrypto && !hasDivs) || loading} onClick={download}>CSV</Button>
        </div>
      )}
    >
      <div className="grid gap-3 px-4 pb-4 pt-3">
        {(hasCrypto || hasDivs) && <h4 className="text-[13px] font-semibold text-fg">{t('pit38_shares')}</h4>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat blur={isPrivate} label={t('pit38_revenue')} value={`${fmt(totals.revenue)} zł`} />
          <Stat blur={isPrivate} label={t('pit38_cost')} value={`${fmt(totals.cost)} zł`} />
          <Stat blur={isPrivate} label={t('pit38_income')} value={`${totals.income >= 0 ? '' : '−'}${fmt(Math.abs(totals.income))} zł`} tone={totals.income >= 0 ? 'up' : 'down'} />
          <Stat
            blur={isPrivate}
            label={t('pit38_tax')}
            value={`${fmt(taxAfter, 0)} zł`}
            tone={taxAfter > 0 ? 'warn' : undefined}
            hint={carry.deduction > 0 ? t('pit38_tax_before_loss').replace('{v}', fmt(totals.tax, 0)) : undefined}
          />
        </div>
        {loading && <p className="text-small text-faint">{t('pit38_loading_rates')}</p>}
        {(carry.deduction > 0 || carry.losses.length > 0) && (
          <Callout tone="info" icon={Info}>
            {carry.deduction > 0 && <p>{t('pit38_loss_deducted').replace('{v}', fmt(carry.deduction)).replace('{base}', fmt(carry.base, 0))}</p>}
            {carry.losses.length > 0 && (
              <p>{t('pit38_loss_left')} {carry.losses.map(l => `${l.year}: ${fmt(l.remaining)} zł`).join(', ')}.</p>
            )}
            <p className="mt-1 text-[11px] text-faint">{t('pit38_loss_note')}</p>
          </Callout>
        )}
        {!loading && totals.missingRates > 0 && (
          <Callout tone="warn" icon={TriangleAlert}>{t('pit38_missing_rates').replace('{n}', totals.missingRates)}</Callout>
        )}
        {totals.uncovered > 0 && (
          <Callout tone="warn" icon={TriangleAlert}>{t('pit38_uncovered').replace('{n}', totals.uncovered)}</Callout>
        )}
        {hasCrypto && (
          <section className="grid gap-2 border-t border-line pt-3" aria-label={t('pit38_crypto')}>
            <h4 className="text-[13px] font-semibold text-fg">{t('pit38_crypto')}</h4>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat blur={isPrivate} label={t('pit38_revenue')} value={`${fmt(crypto.revenue)} zł`} />
              <Stat
                blur={isPrivate} label={t('pit38_cost')} value={`${fmt(crypto.cost + crypto.carriedIn)} zł`}
                hint={crypto.carriedIn > 0 ? t('pit38_crypto_carried_in').replace('{v}', fmt(crypto.carriedIn)) : undefined}
              />
              <Stat blur={isPrivate} label={t('pit38_income')} value={`${crypto.income >= 0 ? '' : '−'}${fmt(Math.abs(crypto.income))} zł`} tone={crypto.income >= 0 ? 'up' : 'down'} />
              <Stat blur={isPrivate} label={t('pit38_tax')} value={`${fmt(crypto.tax, 0)} zł`} tone={crypto.tax > 0 ? 'warn' : undefined} />
            </div>
            <p className="text-[11px] leading-relaxed text-faint">
              {t('pit38_crypto_note')}
              {crypto.carryOut > 0 && <> {t('pit38_crypto_carry_out').replace('{v}', fmt(crypto.carryOut))}</>}
            </p>
            {!loading && crypto.missingRates > 0 && (
              <Callout tone="warn" icon={TriangleAlert}>{t('pit38_missing_rates_any').replace('{n}', crypto.missingRates)}</Callout>
            )}
          </section>
        )}
        {hasDivs && (
          <section className="grid gap-2 border-t border-line pt-3" aria-label={t('pit38_divs')}>
            <h4 className="text-[13px] font-semibold text-fg">{t('pit38_divs')}</h4>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat blur={isPrivate} label={t('pit38_divs_gross')} value={`${fmt(dividends.grossPLN)} zł`} />
              <Stat blur={isPrivate} label={t('pit38_divs_tax19')} value={`${fmt(dividends.tax19)} zł`} />
              <Stat blur={isPrivate} label={t('pit38_divs_paid')} value={`${fmt(dividends.paidAbroad)} zł`} />
              <Stat blur={isPrivate} label={t('pit38_divs_due')} value={`${fmt(dividends.due, 0)} zł`} tone={dividends.due > 0 ? 'warn' : undefined} />
            </div>
            <p className="text-[11px] leading-relaxed text-faint">{t('pit38_divs_note')}</p>
            {dividends.estimated > 0 && (
              <Callout tone="info" icon={Info}>{t('pit38_divs_estimated').replace('{n}', dividends.estimated)}</Callout>
            )}
            {!loading && dividends.missingRates > 0 && (
              <Callout tone="warn" icon={TriangleAlert}>{t('pit38_missing_rates_any').replace('{n}', dividends.missingRates)}</Callout>
            )}
          </section>
        )}
        {(hasCrypto || hasDivs) && (
          <p className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3 text-[13px]">
            <span className="text-dim">{t('pit38_total_due')}</span>
            <span className={cx('text-base font-bold', taxAll > 0 ? 'text-warn' : 'text-fg', blur)}>{fmt(taxAll, 0)} zł</span>
          </p>
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
