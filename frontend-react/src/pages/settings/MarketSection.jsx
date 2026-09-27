import { useState } from 'react';
import { Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useT } from '../../context/LanguageContext';
import { getMdApiKey, setMdApiKey } from '../../services/MarketDataService';
import { US_TAX_KEY } from '../../services/dividendService';
import { lsSet } from '../../utils/safeStorage.js';
import { Badge, Button, Card, Input } from '../../components/ui';
import { cx } from '../../components/ui/cx.js';
import { Row } from './common.jsx';

function DividendTaxCard() {
  const t = useT();
  const [usTax, setUsTax] = useState(() => localStorage.getItem(US_TAX_KEY) || '15');
  const save = val => { setUsTax(val); lsSet(US_TAX_KEY, val); };
  return (
    <Card title={t('dividend_tax')}>
      <div className="grid gap-3 px-4 pb-4">
        <Row label={t('gpw_tax')} value={t('gpw_tax_value')} />
        <div role="radiogroup" aria-label={t('us_stocks')} className="grid gap-2">
          <span className="text-label font-semibold uppercase text-dim">{t('us_stocks')}</span>
          <div className="grid grid-cols-2 gap-2">
            {[{ val: '15', desc: t('agreement_pl_us') }, { val: '30', desc: t('full_withholding') }].map(opt => {
              const active = usTax === opt.val;
              return (
                <button
                  key={opt.val} type="button" role="radio" aria-checked={active} onClick={() => save(opt.val)}
                  className={cx('rounded-card-sm border px-3 py-2.5 text-left transition', active ? 'border-accent bg-panel-hover' : 'border-line bg-panel-2 hover:border-line-strong')}
                >
                  <span className={cx('block text-[16px] font-bold', active ? 'text-accent-text' : 'text-fg')}>{opt.val}%</span>
                  <span className="block text-[11px] text-dim">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

function CurrencyRatesCard() {
  const t = useT();
  const { fxRates } = useApp();
  return (
    <Card title={t('currency_rates')}>
      <div className="px-4 pb-4">
        {['USD', 'EUR', 'GBP'].map(cur => (
          <Row key={cur} label={`${cur} / PLN`} value={`${fxRates[cur] != null ? fxRates[cur].toFixed(4) : '—'} zł`} />
        ))}
        <p className="pt-2 text-[11px] text-faint">{t('currency_rates_info')}</p>
      </div>
    </Card>
  );
}

function ApiKeyCard() {
  const t = useT();
  const [key, setKey] = useState(getMdApiKey);
  const [saved, setSaved] = useState(false);
  const isSet = !!getMdApiKey();
  function save() { setMdApiKey(key); setSaved(true); setTimeout(() => setSaved(false), 2000); }
  return (
    <Card title={t('api_keys')}>
      <div className="grid gap-2 px-4 pb-4">
        <Row label={<span className="inline-flex items-center gap-2">MarketData.app <Badge tone={isSet ? 'up' : 'warn'}>{isSet ? t('api_key_set') : t('api_key_unset')}</Badge></span>}>
          <div className="flex w-full max-w-sm gap-2">
            <Input type="password" aria-label="MarketData.app API key" className="min-w-0 flex-1 font-mono" value={key} onChange={e => setKey(e.target.value)} placeholder={t('api_key_placeholder')} />
            <Button variant={saved ? 'secondary' : 'primary'} icon={saved ? Check : undefined} onClick={save}>{saved ? t('saved_ok') : t('save_btn')}</Button>
          </div>
        </Row>
        <p className="text-[11px] text-faint">{t('api_key_info')} {t('api_key_free')}</p>
      </div>
    </Card>
  );
}

export default function MarketSection() {
  return (
    <div className="space-y-4">
      <DividendTaxCard />
      <CurrencyRatesCard />
      <ApiKeyCard />
    </div>
  );
}
