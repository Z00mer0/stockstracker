import { useState } from 'react';
import { Scale } from 'lucide-react';
import { useLanguage, useT } from '../../context/LanguageContext';
import { usePrivacy } from '../../context/PrivacyContext';
import { brokerCheck, brokerCheckIssues } from '../../utils/brokerCheck.js';
import { lsSet } from '../../utils/safeStorage.js';
import { Button, Callout, Card, Field, Input } from '../../components/ui';

// Zgodność z biurem: wartość rachunku z biura (akcje + gotówka) obok wyceny
// z aplikacji. Ostatnio wpisana kwota zostaje w przeglądarce, osobno dla portfela.
const KEY = id => `myfund_broker_check_${id}`;

export default function BrokerCheckCard({ portfolioId, positions, positionsValuePLN, cashPLN, portFx, portCurrLabel, partialPrices, fxStale }) {
  const t = useT();
  const { locale } = useLanguage();
  const { isPrivate } = usePrivacy();
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY(portfolioId)) || 'null'); } catch { return null; }
  });
  const [input, setInput] = useState(saved?.value != null ? String(saved.value) : '');

  const fmt = v => `${v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${portCurrLabel}`;
  const blur = isPrivate ? 'privacy-blur' : '';

  function check() {
    const value = parseFloat(String(input).replace(/\s/g, '').replace(',', '.'));
    if (!(value > 0)) return;
    const next = { value, date: new Date().toISOString().slice(0, 10) };
    setSaved(next);
    lsSet(KEY(portfolioId), JSON.stringify(next));
  }

  // Wpisana kwota jest w walucie wyświetlania — wycena aplikacji też.
  const result = saved && brokerCheck({ brokerValue: saved.value, positionsValue: positionsValuePLN / portFx, cashValue: cashPLN / portFx });
  const issues = brokerCheckIssues(positions, { partialPrices, fxStale });
  const issueText = i => t(`broker_issue_${i.key}`).replace('{symbols}', (i.symbols ?? []).join(', '));

  return (
    <Card title={<span className="inline-flex items-center gap-2"><Scale size={15} aria-hidden className="text-dim" />{t('broker_check_title')}</span>}>
      <div className="space-y-3 px-5 py-4">
        <p className="text-small text-faint">{t('broker_check_hint')}</p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); check(); }}>
          <Field label={t('broker_check_value')} className="min-w-[200px] flex-1">
            <Input type="text" inputMode="decimal" suffix={portCurrLabel} value={input} onChange={e => setInput(e.target.value)} placeholder="0,00" />
          </Field>
          <Button type="submit" variant="primary">{t('broker_check_btn')}</Button>
        </form>

        {result && (
          <>
            <dl className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small tabular-nums ${blur}`}>
              <dt className="text-dim">{t('broker_check_app')}</dt>
              <dd className="text-right text-fg">{fmt(result.app)}</dd>
              <dt className="text-dim">{t('broker_check_broker').replace('{date}', new Date(`${saved.date}T12:00:00`).toLocaleDateString(locale))}</dt>
              <dd className="text-right text-fg">{fmt(saved.value)}</dd>
              <dt className="font-semibold text-fg">{t('broker_check_diff')}</dt>
              <dd className={`text-right font-semibold ${result.ok ? 'text-up' : 'text-warn'}`}>
                {result.diff >= 0 ? '+' : ''}{fmt(result.diff)} ({result.pct >= 0 ? '+' : ''}{result.pct.toLocaleString(locale, { maximumFractionDigits: 2 })}%)
              </dd>
            </dl>
            {result.ok ? (
              <Callout tone="up" icon={Scale}>{t('broker_check_ok')}</Callout>
            ) : (
              <Callout tone="warn" icon={Scale} title={t(result.diff > 0 ? 'broker_check_more' : 'broker_check_less')}>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {issues.map(i => <li key={i.key}>{issueText(i)}</li>)}
                  <li>{t(result.diff > 0 ? 'broker_cause_more' : 'broker_cause_less')}</li>
                  <li>{t('broker_cause_timing')}</li>
                </ul>
              </Callout>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
