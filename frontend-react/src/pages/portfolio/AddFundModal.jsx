import { formatDate } from '../../utils/format.js';
import { useState } from 'react';
import { useLanguage, useT } from '../../context/LanguageContext';
import { Button, Field, Input, Modal, Select } from '../../components/ui';

// Fundusz inwestycyjny (TFI): kod ze stooq (np. 1048.N), wycena jednostki
// pobierana codziennie przez /api/quotes.
export const FUND_CODE_RE = /^\d+\.N$/i;

export default function AddFundModal({ onSave, onClose }) {
  const t = useT();
  const { locale } = useLanguage();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('PLN');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [check, setCheck] = useState(null);   // { price, date } | 'missing' | 'loading'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sym = code.trim().toUpperCase();

  async function lookup() {
    if (!FUND_CODE_RE.test(sym)) { setError(t('fund_err_code')); return; }
    setError(''); setCheck('loading');
    try {
      const r = await fetch(`/api/quotes?format=map&symbols=${encodeURIComponent(sym)}`);
      const e = (await r.json())?.quotes?.[sym];
      if (e?.price > 0) {
        setCheck({ price: e.price, date: e.date ?? null });
        if (!price) setPrice(String(e.price));
      } else setCheck('missing');
    } catch { setCheck('missing'); }
  }

  async function handleSave() {
    if (!FUND_CODE_RE.test(sym)) { setError(t('fund_err_code')); return; }
    const q = parseFloat(qty), p = parseFloat(price);
    if (isNaN(q) || q <= 0) { setError(t('err_enter_qty_short')); return; }
    if (isNaN(p) || p <= 0) { setError(t('err_enter_price_short')); return; }
    setSaving(true); setError('');
    try {
      await onSave({ symbol: sym, qty: q, price: p, currency, date, note: name.trim() || 'Fundusz', assetType: 'fund', name: name.trim() });
      onClose();
    } catch (e) {
      setError(e.message || t('save_error'));
    } finally { setSaving(false); }
  }

  return (
    <Modal
      size="sm"
      title={t('fund_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{t('add')}</Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={e => { e.preventDefault(); handleSave(); }}>
        <div className="flex items-end gap-2">
          <Field label={t('fund_code_label')} className="flex-1">
            <Input placeholder="1048.N" value={code} onChange={e => { setCode(e.target.value); setCheck(null); }} onBlur={() => FUND_CODE_RE.test(sym) && check == null && lookup()} />
          </Field>
          <Button variant="ghost" onClick={lookup} loading={check === 'loading'}>{t('fund_check')}</Button>
        </div>
        <p className="-mt-2 text-small text-faint">{t('fund_code_hint')}</p>
        {check && check !== 'loading' && (
          <p className={`-mt-2 text-small ${check === 'missing' ? 'text-warn' : 'text-up'}`}>
            {check === 'missing'
              ? t('fund_missing')
              : t('fund_found').replace('{price}', check.price.toLocaleString(locale, { maximumFractionDigits: 4 })).replace('{date}', formatDate(check.date, locale))}
          </p>
        )}
        <Field label={t('fund_name_label')}>
          <Input placeholder={t('fund_name_ph')} value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('fund_units_label')}>
            <Input type="number" min="0" step="any" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
          </Field>
          <Field label={t('fund_price_label')}>
            <Input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
          </Field>
          <Field label={t('currency_label')}>
            <Select value={currency} onChange={e => setCurrency(e.target.value)}>
              {['PLN', 'USD', 'EUR'].map(c => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t('buy_date_label')}>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
        </div>
        {error && <p role="alert" className="text-small text-down">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
