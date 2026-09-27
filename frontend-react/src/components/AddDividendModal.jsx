import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../context/LanguageContext';
import { Button, Field, Input, Modal, Select } from './ui';

const EMPTY = { symbol: '', exDate: '', payDate: '', amount: '', currency: 'PLN', note: '' };

export default function AddDividendModal({ isOpen, onClose, onSave, initialData = null }) {
  const { portfolio } = useApp();
  const t = useT();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Waluta pozycji — dywidenda z AAPL jest w $, nie w zł. Wcześniej okno
  // otwarte z Portfela zawsze proponowało PLN, więc 0,25 $ zapisywało się
  // jako 0,25 zł (czterokrotnie za mało po przeliczeniu).
  const currencyOf = sym => portfolio.find(p => p.symbol === sym)?.currency;

  useEffect(() => {
    if (isOpen) {
      setError('');
      setForm(initialData
        ? { symbol: initialData.symbol ?? '', exDate: initialData.exDate ?? '', payDate: initialData.payDate ?? '',
            amount: String(initialData.amount ?? ''),
            currency: initialData.currency ?? currencyOf(initialData.symbol) ?? 'PLN', note: initialData.note ?? '' }
        : EMPTY
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  // Edytowana dywidenda może dotyczyć spółki już sprzedanej — bez tego lista
  // jej nie zawierała i pole spółki wyglądało na puste.
  const symbols = [...new Set([...portfolio.map(p => p.symbol), form.symbol].filter(Boolean))].sort();
  const amount = parseFloat(form.amount);
  const valid = form.symbol && form.exDate && amount > 0;

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  function pickSymbol(sym) {
    setForm(prev => ({ ...prev, symbol: sym, currency: currencyOf(sym) ?? prev.currency }));
  }

  // Czekamy na zapis: wcześniej okno zamykało się od razu, a odrzucony zapis
  // (np. w widoku „Wszystkie") kończył się niezłapanym błędem bez śladu.
  async function handleSave(e) {
    e?.preventDefault();
    if (!valid) return;
    setSaving(true); setError('');
    try {
      await onSave({
        symbol: form.symbol, exDate: form.exDate,
        payDate: form.payDate || null,
        amount,
        currency: form.currency, note: form.note.trim(),
      });
      onClose();
    } catch (err) {
      setError(err?.message || t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="sm"
      title={initialData?.id ? t('edit_dividend_title') : t('add_dividend_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" type="submit" form="add-dividend" disabled={!valid} loading={saving}>{t('save_btn')}</Button>
        </>
      }
    >
      <form id="add-dividend" onSubmit={handleSave} className="grid gap-3">
        <Field label={t('col_company')}>
          <Select value={form.symbol} onChange={e => pickSymbol(e.target.value)}>
            <option value="">—</option>
            {symbols.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('ex_date_label')}>
            <Input type="date" value={form.exDate} onChange={e => set('exDate', e.target.value)} />
          </Field>
          <Field label={t('pay_date_label')}>
            <Input type="date" value={form.payDate} onChange={e => set('payDate', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
          <Field label={t('amount_per_share')}>
            <Input type="number" min="0" step="0.0001" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </Field>
          <Field label={t('currency_label')}>
            <Select value={form.currency} onChange={e => set('currency', e.target.value)}>
              {['PLN', 'USD', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t('note_label')}>
          <Input type="text" maxLength={120} placeholder={t('dividend_note_ph')} value={form.note} onChange={e => set('note', e.target.value)} />
        </Field>
        {error && <p role="alert" className="text-small text-down">{error}</p>}
      </form>
    </Modal>
  );
}
