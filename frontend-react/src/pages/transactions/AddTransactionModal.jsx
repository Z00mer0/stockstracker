import { useState } from 'react';
import { useT } from '../../context/LanguageContext';
import { Button, Field, Input, Modal, SegmentedControl, Select } from '../../components/ui';

const TYPES = ['BUY', 'SELL', 'DIV', 'CASH'];
const TYPE_LABEL = { BUY: 'type_buy', SELL: 'type_sell', DIV: 'type_div', CASH: 'type_cash' };

export default function AddTransactionModal({ onSave, onClose }) {
  const t = useT();
  const [form, setForm] = useState({
    type: 'BUY',
    symbol: '',
    qty: '',
    price: '',
    currency: 'PLN',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const isCash = form.type === 'CASH';

  async function handleSave() {
    if (!form.symbol.trim()) { setError(t('err_enter_symbol')); return; }
    const qty = isCash ? null : parseFloat(form.qty);
    const price = parseFloat(form.price);
    if (!isCash && (isNaN(qty) || qty <= 0)) { setError(t('err_enter_qty_short')); return; }
    if (isNaN(price) || price < 0) { setError(t('err_enter_price_short')); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        id: Math.random().toString(36).slice(2, 10),
        type: form.type,
        symbol: form.symbol.trim().toUpperCase(),
        qty,
        price,
        currency: form.currency,
        date: form.date,
        note: form.note.trim(),
      });
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || e.message || t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="sm"
      title={t('add_transaction_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{t('save_btn')}</Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={e => { e.preventDefault(); handleSave(); }}>
        {/* Przełącznik typu na całą szerokość okna. */}
        <div className="[&_.seg]:flex [&_.seg]:w-full [&_.seg_button]:flex-1">
          <SegmentedControl
            options={TYPES.map(tp => ({ value: tp, label: t(TYPE_LABEL[tp]) }))}
            value={form.type}
            onChange={v => set('type', v)}
          />
        </div>
        <Field label={t('col_symbol')}>
          <Input
            placeholder={t('pf_eg').replace('{v}', 'AAPL, CDR.WA')}
            autoCapitalize="characters"
            value={form.symbol}
            onChange={e => set('symbol', e.target.value.toUpperCase())}
          />
        </Field>
        <div className={isCash ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2'}>
          {!isCash && (
            <Field label={t('qty_short')}>
              <Input type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={form.qty} onChange={e => set('qty', e.target.value)} />
            </Field>
          )}
          <Field label={isCash ? t('col_value') : t('price_label')}>
            <Input type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" value={form.price} onChange={e => set('price', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('currency_label')}>
            <Select value={form.currency} onChange={e => set('currency', e.target.value)}>
              {['PLN', 'USD', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t('col_date')}>
            <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </Field>
        </div>
        <Field label={t('note_optional')}>
          <Input value={form.note} onChange={e => set('note', e.target.value)} />
        </Field>
        {error && <p role="alert" className="text-small text-down">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
