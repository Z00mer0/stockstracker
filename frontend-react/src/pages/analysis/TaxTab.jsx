import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, Receipt, PiggyBank, Sprout, Info, Lightbulb, PartyPopper } from 'lucide-react';
import { usePrivacy } from '../../context/PrivacyContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import { Callout, Card, EmptyState, Stat, Table } from '../../components/ui';
import { cx } from '../../components/ui/cx.js';
import { usePit38 } from '../../hooks/usePit38.js';

// Optymalizator podatku Belki (tax-loss harvesting) — logika bez zmian:
// straty z otwartych pozycji rozdzielane na zrealizowany zysk w roku,
// od największej, do wyczerpania zysku. Kwoty w PLN (podatek jest w PLN).
const BELKA_RATE = 0.19;

export default function TaxTab({ enriched, realizedYtdPLN: avgCostYtd, accountType }) {
  const t = useT();
  const { locale } = useLanguage();
  const { isPrivate } = usePrivacy();
  const year = new Date().getFullYear();
  // Wynik roku i podatek tak, jak w PIT-38 (FIFO, kursy NBP z dnia przed
  // transakcją). Do czasu pobrania kursów — przybliżenie średnią ceną
  // i bieżącym kursem, jak wcześniej.
  const { forYear, loading: pitLoading } = usePit38();
  const pit = useMemo(() => forYear(year), [forYear, year]);
  const exact = !pitLoading && pit.totals.missingRates === 0;
  const realizedYtdPLN = exact ? pit.totals.income : avgCostYtd;
  const fmt = (n, d = 0) => (n == null || isNaN(n) ? '—' : n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d }));

  const losers = useMemo(() => enriched
    .filter(p => (p.plPLN ?? 0) < -0.005)
    .map(p => ({ symbol: p.symbol, lossPLN: -p.plPLN }))
    .sort((a, b) => b.lossPLN - a.lossPLN), [enriched]);

  if (accountType === 'IKE' || accountType === 'IKZE') {
    return <EmptyState icon={PartyPopper} title={t('tax_opt_title')} description={t('tax_opt_ike_note').replace('{type}', accountType)} />;
  }

  const taxDue = exact ? pit.totals.tax : Math.max(0, realizedYtdPLN) * BELKA_RATE;
  let remaining = Math.max(0, realizedYtdPLN);
  const rows = losers.map(l => {
    const offset = Math.min(l.lossPLN, remaining);
    remaining -= offset;
    return { ...l, offset, savingPLN: offset * BELKA_RATE };
  });
  const totalSaving = rows.reduce((s, r) => s + r.savingPLN, 0);
  const taxAfter = taxDue - totalSaving;
  const helped = rows.filter(r => r.savingPLN > 0).length;
  const posKey = { one: 'tax_opt_pos_one', few: 'tax_opt_pos_few' }[new Intl.PluralRules(locale).select(helped)] ?? 'tax_opt_pos_many';
  const blur = isPrivate ? 'privacy-blur' : undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          blur={isPrivate} icon={Landmark}
          label={t('tax_opt_realized_ytd').replace('{year}', year)}
          value={`${realizedYtdPLN >= 0 ? '+' : ''}${fmt(realizedYtdPLN)} zł`}
          tone={realizedYtdPLN >= 0 ? 'up' : 'down'}
        />
        <Stat blur={isPrivate} icon={Receipt} label={t('tax_opt_tax_due')} value={`${fmt(taxDue)} zł`} tone={taxDue > 0 ? 'warn' : undefined} />
        <Stat
          blur={isPrivate} icon={PiggyBank} className="col-span-2 lg:col-span-1"
          label={t('tax_opt_saving')}
          value={totalSaving > 0 ? `−${fmt(totalSaving)} zł` : '0 zł'}
          tone={totalSaving > 0 ? 'up' : undefined}
        />
      </div>

      <p className="text-small text-dim">
        {exact ? t('tax_pit38_basis') : t('tax_pit38_approx')}{' '}
        <Link to="/closed" className="font-semibold text-accent-text hover:underline">{t('tax_pit38_link')}</Link>
      </p>

      <Card title={t('tax_opt_title')}>
        {losers.length === 0 ? (
          <EmptyState icon={Sprout} title={t('tax_opt_no_losses')} className="py-8" />
        ) : (
          <>
            {realizedYtdPLN <= 0 && (
              <div className="px-4 pt-4"><Callout tone="info" icon={Info}>{t('tax_opt_no_gains_note')}</Callout></div>
            )}
            <Table
              columns={[
                { key: 'symbol', header: t('col_symbol'), mobile: 'title', render: r => <span className="font-semibold text-fg">{r.symbol}</span> },
                { key: 'lossPLN', header: t('tax_opt_col_loss'), align: 'right', render: r => <span className={cx('text-down', blur)}>−{fmt(r.lossPLN)} zł</span> },
                {
                  key: 'savingPLN', header: t('tax_opt_col_saving'), align: 'right', mobile: 'aside',
                  render: r => (r.savingPLN > 0 ? <span className={cx('font-bold text-up', blur)}>−{fmt(r.savingPLN)} zł</span> : <span className="text-faint">—</span>),
                },
              ]}
              rows={rows}
              rowKey={r => r.symbol}
            />
            {totalSaving > 0 && (
              <div className="flex justify-between border-t border-line px-4 py-2.5 text-small font-semibold text-fg">
                <span>{t('tax_opt_after_row')}</span>
                <span className={blur}>{fmt(taxAfter)} zł</span>
              </div>
            )}
          </>
        )}
      </Card>

      {totalSaving > 0 && (
        <Callout tone="up" icon={Lightbulb}>
          {t('tax_opt_summary').replace('{positions}', t(posKey).replace('{n}', helped)).replace('{saving}', fmt(totalSaving))}
        </Callout>
      )}

      <p className="rounded-card-sm border border-line bg-panel-2 px-4 py-3 text-[11px] leading-relaxed text-faint">{t('tax_opt_disclaimer')}</p>
    </div>
  );
}
