import { useState } from 'react';
import { useT } from '../context/LanguageContext';
import { Button, Field, Input, Modal } from './ui';

export default function EditPositionModal({ holding, onSave, onClose }) {
  const t = useT();
  const [qty, setQty]           = useState(String(holding?.qty ?? ''));
  const [avgPrice, setAvgPrice] = useState(String(holding?.avgPrice ?? ''));
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function handleSave(e) {
    e?.preventDefault();
    const q = parseFloat(qty);
    const p = parseFloat(avgPrice);
    if (isNaN(q) || q <= 0)  { setError(t('err_enter_qty_pos')); return; }
    if (isNaN(p) || p <= 0)  { setError(t('err_enter_avg_price')); return; }
    setSaving(true); setError('');
    try {
      await onSave({ symbol: holding.symbol, qty: q, avgPrice: p });
      onClose();
    } catch (err) {
      setError(err.message || t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="sm"
      title={`${t('edit_position')} ${holding?.symbol ?? ''}`}
      description={t('edit_pos_hint')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" type="submit" form="edit-position" loading={saving}>{t('save_btn')}</Button>
        </>
      }
    >
      <form id="edit-position" onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2">
        <Field label={t('sell_qty_label')}>
          <Input type="number" min="0" step="any" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
        </Field>
        <Field label={`${t('avg_price_currency')} (${holding?.currency ?? 'PLN'})`} required>
          <Input type="number" min="0" step="any" inputMode="decimal" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} />
        </Field>
        {error && <p role="alert" className="text-small text-down sm:col-span-2">{error}</p>}
      </form>
    </Modal>
  );
}
