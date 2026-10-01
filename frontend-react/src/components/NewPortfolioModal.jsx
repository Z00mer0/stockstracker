import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../context/LanguageContext';
import { Button, Field, Input, Modal, SegmentedControl } from './ui';
import { BASE_CURRENCY_KEY } from './SetupWizard.jsx';

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];
const ACCOUNT_TYPES = ['', 'IKE', 'IKZE'];

export default function NewPortfolioModal({ onClose }) {
  const { createPortfolio } = useApp();
  const t = useT();
  const [name, setName]         = useState('');
  // Domyślnie waluta wybrana w kreatorze powitalnym (jeśli był).
  const [currency, setCurrency] = useState(() => {
    try { const c = localStorage.getItem(BASE_CURRENCY_KEY); return CURRENCIES.includes(c) ? c : 'PLN'; } catch { return 'PLN'; }
  });
  const [accountType, setAccountType] = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function handleSave(e) {
    e?.preventDefault();
    if (!name.trim()) { setError(t('err_enter_portfolio_name')); return; }
    setSaving(true); setError('');
    try {
      await createPortfolio(name.trim(), currency, accountType);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="sm"
      title={t('new_portfolio_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" type="submit" form="new-portfolio" loading={saving}>{t('create_portfolio')}</Button>
        </>
      }
    >
      <form id="new-portfolio" onSubmit={handleSave} className="grid gap-4">
        <Field label={t('portfolio_name')} error={error || undefined}>
          <Input placeholder={t('portfolio_name_ph')} value={name} onChange={e => { setName(e.target.value); setError(''); }} />
        </Field>
        <Field label={t('base_currency')}>
          <SegmentedControl block aria-label={t('base_currency')} options={CURRENCIES} value={currency} onChange={setCurrency} />
        </Field>
        <Field label={t('account_type_label')} hint={t('account_type_hint')}>
          <SegmentedControl
            block
            aria-label={t('account_type_label')}
            options={ACCOUNT_TYPES.map(at => ({ value: at, label: at || t('account_type_standard') }))}
            value={accountType}
            onChange={setAccountType}
          />
        </Field>
      </form>
    </Modal>
  );
}
