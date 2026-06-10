import React, { useState } from 'react';
import { useLanguage, useT } from '../context/LanguageContext';

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.72)',
  backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};

const card = {
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 400,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
};

export default function SellStockModal({ holding, onSave, onClose }) {
  const t = useT();
  const { locale } = useLanguage();
  const [qty, setQty]           = useState('');
  const [price, setPrice]       = useState(holding?.avgPrice ?? '');
  const [currency, setCurrency] = useState(holding?.currency ?? 'PLN');
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [editingPL, setEditingPL] = useState(false);
  const [manualPL, setManualPL]   = useState('');

  const q   = parseFloat(qty);
  const p   = parseFloat(price);
  const avg = holding?.avgPrice;
  const calcPL = (!isNaN(q) && q > 0 && !isNaN(p) && p > 0 && avg)
    ? (p - avg) * q
    : null;

  function startEditPL() {
    if (calcPL != null && manualPL === '') setManualPL(calcPL.toFixed(2));
    setEditingPL(true);
  }

  function resetPL() {
    setManualPL('');
    setEditingPL(false);
  }

  const effectivePL = editingPL && manualPL !== '' ? parseFloat(manualPL) : calcPL;

  async function handleSave() {
    if (isNaN(q) || q <= 0) { setError(t('err_enter_qty_short')); return; }
    if (q > (holding?.qty ?? 0)) { setError(`${t('err_too_many_shares')} ${holding.qty} szt.`); return; }
    if (isNaN(p) || p <= 0) { setError(t('err_enter_sell_price')); return; }
    setSaving(true); setError('');
    try {
      const overridePL = (editingPL && manualPL !== '' && !isNaN(parseFloat(manualPL)))
        ? parseFloat(manualPL)
        : undefined;
      await onSave({ symbol: holding.symbol, qty: q, price: p, currency, date, note: note.trim(), overridePL });
      onClose();
    } catch (e) {
      setError(e.message || t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          {t('sell_title')} {holding?.symbol}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20 }}>
          {t('already_own_prefix')} {holding?.qty} {t('already_own_suffix')} {holding?.avgPrice} {holding?.currency}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="field-label">{t('sell_qty_label')}</label>
            <input
              type="number" min="0" step="any"
              className="field-input"
              placeholder={`max ${holding?.qty}`}
              value={qty}
              onChange={e => setQty(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="field-label">{t('sell_price_label')}</label>
            <input
              type="number" min="0" step="any"
              className="field-input"
              value={price}
              onChange={e => setPrice(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="field-label">{t('currency_label')}</label>
            <select className="field-input" value={currency} onChange={e => setCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{t('sell_date_label')}</label>
            <input type="date" className="field-input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="field-label">{t('note_optional')}</label>
          <input
            className="field-input"
            placeholder={t('note_placeholder')}
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {calcPL != null && (
          <div style={{ background: 'var(--bg-3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
            {editingPL ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{t('manual_result')}:</span>
                <input
                  type="number" step="any"
                  className="field-input"
                  style={{ flex: 1, padding: '3px 8px', fontSize: 12 }}
                  value={manualPL}
                  onChange={e => setManualPL(e.target.value)}
                  autoFocus
                />
                <span style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{currency}</span>
                <button
                  onClick={resetPL}
                  style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 11, padding: '2px 4px', whiteSpace: 'nowrap' }}
                  title={t('restore_auto')}
                >
                  {t('restore_auto')}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ color: 'var(--text-faint)' }}>{t('est_result')}: </span>
                  <span style={{ color: effectivePL >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
                    {effectivePL >= 0 ? '+' : ''}{effectivePL.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                    {' '}({(((p - avg) / avg) * 100).toFixed(2)}%)
                  </span>
                </div>
                <button
                  onClick={startEditPL}
                  style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 11, padding: '2px 6px' }}
                  title={t('edit_pl')}
                >
                  {t('edit_pl')}
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>{t('cancel')}</button>
          <button
            className="btn"
            style={{ flex: 1, background: 'var(--down)', color: '#fff', fontWeight: 600 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t('saving') : t('sell_title')}
          </button>
        </div>
      </div>
    </div>
  );
}
