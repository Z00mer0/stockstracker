import { useState } from 'react';
import { ArrowLeft, ArrowRight, PartyPopper, Rocket, Scale, Shield } from 'lucide-react';
import { lsSet } from '../utils/safeStorage.js';
import { useApp } from '../context/AppContext';
import { useT } from '../context/LanguageContext';
import { Button, Modal } from './ui';
import { cx } from './ui/cx.js';

const WIZARD_KEY = 'myfund_wizard_done';

export function shouldShowWizard(portfolio) {
  if (localStorage.getItem(WIZARD_KEY)) return false;
  return portfolio.length === 0;
}

export function dismissWizard() {
  lsSet(WIZARD_KEY, '1');
}

// Czy kreator jest jeszcze przed użytkownikiem — okno „Nowy portfel" czeka
// na jego koniec (wcześniej oba otwierały się naraz, jedno na drugim).
export function wizardPending() {
  try { return !localStorage.getItem(WIZARD_KEY); } catch { return false; }
}
export const WIZARD_DONE_EVENT = 'myfund-wizard-done';
export const BASE_CURRENCY_KEY = 'myfund_base_currency';

const PROFILES = [
  { key: 'conservative', icon: Shield },
  { key: 'balanced', icon: Scale },
  { key: 'aggressive', icon: Rocket },
];

const CURRENCIES = [
  { key: 'PLN', flag: '🇵🇱' },
  { key: 'USD', flag: '🇺🇸' },
  { key: 'EUR', flag: '🇪🇺' },
  { key: 'GBP', flag: '🇬🇧' },
];

function Choice({ selected, onClick, children, className }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'rounded-card-sm border-2 px-4 py-3 text-left transition',
        selected ? 'border-accent bg-panel-hover' : 'border-line bg-panel-2 hover:border-line-strong',
        className,
      )}
    >
      {children}
    </button>
  );
}

export default function SetupWizard({ onDone }) {
  const t = useT();
  const { portfolios, updatePortfolio } = useApp();
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(null);
  // Domyślnie waluta istniejącego portfela — to ona decyduje o wyświetlaniu.
  const only = portfolios.length === 1 ? portfolios[0] : null;
  const [currency, setCurrency] = useState(only?.currency || 'PLN');
  const [saving, setSaving] = useState(false);

  async function finish() {
    dismissWizard();
    if (profile) lsSet('myfund_inv_profile', profile);
    // Nowe konto nie ma jeszcze portfela — waluta trafia jako domyślna do
    // okna „Nowy portfel", które otwiera się zaraz po kreatorze.
    lsSet(BASE_CURRENCY_KEY, currency);
    // Wybrana waluta naprawdę ustawia walutę portfela. Wcześniej trafiała do
    // klucza, którego nic nie czytało — kreator obiecywał przeliczanie, a
    // wszystko zostawało w walucie portfela. Portfel jest tu jeszcze pusty,
    // więc zmiana waluty niczego nie przelicza wstecz.
    if (only && only.currency !== currency) {
      setSaving(true);
      try { await updatePortfolio(only.id, only.name, currency, only.accountType ?? only.account_type ?? ''); }
      catch { /* zostaje dotychczasowa waluta; można ją zmienić później */ }
      finally { setSaving(false); }
    }
    window.dispatchEvent(new Event(WIZARD_DONE_EVENT));
    onDone();
  }

  const dots = (
    <div className="flex justify-center gap-1.5" aria-label={t('wiz_step').replace('{n}', step)}>
      {[1, 2, 3].map(s => (
        <span key={s} className={cx('h-2 rounded-full transition-all', s === step ? 'w-5 bg-accent' : s < step ? 'w-2 bg-accent' : 'w-2 bg-line')} />
      ))}
    </div>
  );

  const footer = step === 1 ? (
    <>
      <Button variant="ghost" onClick={finish}>{t('wiz_skip')}</Button>
      <Button variant="primary" icon={ArrowRight} disabled={!profile} onClick={() => setStep(2)}>{t('wiz_next')}</Button>
    </>
  ) : step === 2 ? (
    <>
      <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(1)}>{t('wiz_back')}</Button>
      <Button variant="primary" icon={ArrowRight} onClick={() => setStep(3)}>{t('wiz_next')}</Button>
    </>
  ) : (
    <Button variant="primary" loading={saving} onClick={finish}>{t('wiz_start')}</Button>
  );

  const title = step === 1 ? t('wiz_welcome') : step === 2 ? t('wiz_currency_title') : t('wiz_done_title');
  const description = step === 1 ? t('wiz_welcome_sub') : step === 2 ? t('wiz_currency_sub') : undefined;

  return (
    <Modal size="md" title={title} description={description} onClose={finish} footer={footer}>
      <div className="grid gap-4">
        {dots}
        {step === 1 && (
          <div className="grid gap-2.5">
            {PROFILES.map(({ key, icon: Icon }) => (
              <Choice key={key} selected={profile === key} onClick={() => setProfile(key)}>
                <span className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-card-sm border border-line bg-panel text-accent-text"><Icon size={18} aria-hidden /></span>
                  <span>
                    <span className="block text-[14px] font-bold text-fg">{t(`wiz_p_${key}`)}</span>
                    <span className="block text-[12px] text-faint">{t(`wiz_p_${key}_desc`)}</span>
                    <span className="mt-0.5 block text-[11px] font-semibold text-accent-text">{t(`wiz_p_${key}_alloc`)}</span>
                  </span>
                </span>
              </Choice>
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="grid grid-cols-2 gap-2.5">
            {CURRENCIES.map(c => (
              <Choice key={c.key} selected={currency === c.key} onClick={() => setCurrency(c.key)} className="text-center">
                <span className="block text-[24px]" aria-hidden>{c.flag}</span>
                <span className="block text-[15px] font-bold text-fg">{c.key}</span>
                <span className="block text-[11px] text-faint">{t(`wiz_cur_${c.key}`)}</span>
              </Choice>
            ))}
          </div>
        )}
        {step === 3 && (
          <div className="grid justify-items-center gap-2 py-2 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full border border-line bg-panel-2 text-accent-text"><PartyPopper size={26} aria-hidden /></span>
            <p className="text-small text-faint">
              {t('wiz_summary_profile')} <b className="text-fg">{profile ? t(`wiz_p_${profile}`) : '—'}</b> · {t('wiz_summary_currency')} <b className="text-fg">{currency}</b>
            </p>
            <p className="text-small text-faint">{t('wiz_done_sub')}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
