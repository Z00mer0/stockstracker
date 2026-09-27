import { useState } from 'react';
import { useT } from '../../context/LanguageContext';
import { Button, Field, Input, Modal, Select } from '../../components/ui';

const CRYPTO_OPTIONS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'MATIC', 'DOT', 'AVAX',
  'LINK', 'UNI', 'LTC', 'BCH', 'ATOM', 'NEAR', 'TON', 'PEPE', 'SUI', 'ARB',
];

export default function AddCryptoModal({ onSave, onClose }) {
  const t = useT();
  const [symbol, setSymbol] = useState('BTC');
  const [customSym, setCustomSym] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const finalSym = symbol === '__custom' ? customSym.trim().toUpperCase() : symbol;

  async function handleSave() {
    if (!finalSym) { setError(t('err_enter_symbol')); return; }
    const q = parseFloat(qty), p = parseFloat(price);
    if (isNaN(q) || q <= 0) { setError(t('err_enter_qty_short')); return; }
    if (isNaN(p) || p <= 0) { setError(t('err_enter_price_short')); return; }
    setSaving(true); setError('');
    try {
      await onSave({ symbol: finalSym, qty: q, price: p, currency, date, note: 'Crypto', assetType: 'crypto' });
      onClose();
    } catch (e) {
      setError(e.message || t('save_error'));
    } finally { setSaving(false); }
  }

  return (
    <Modal
      size="sm"
      title={t('pf_crypto_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{t('add')}</Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={e => { e.preventDefault(); handleSave(); }}>
        <Field label={t('col_symbol')}>
          <Select value={symbol} onChange={e => setSymbol(e.target.value)}>
            {CRYPTO_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            <option value="__custom">{t('pf_crypto_custom')}</option>
          </Select>
        </Field>
        {symbol === '__custom' && (
          <Input aria-label={t('col_symbol')} placeholder={t('pf_eg').replace('{v}', 'PEPE')} value={customSym} onChange={e => setCustomSym(e.target.value.toUpperCase())} />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('qty_short')}>
            <Input type="number" min="0" step="any" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
          </Field>
          <Field label={t('buy_price_label')}>
            <Input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
          </Field>
          <Field label={t('currency_label')}>
            <Select value={currency} onChange={e => setCurrency(e.target.value)}>
              {['USD', 'EUR', 'PLN'].map(c => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t('buy_date_label')}>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
        </div>
        {error && <p role="alert" className="text-small text-down">{error}</p>}
        {/* Enter w polu zapisuje — ukryty przycisk wysyła formularz. */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
