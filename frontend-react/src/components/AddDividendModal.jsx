import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../context/LanguageContext';

const EMPTY = { symbol: '', exDate: '', payDate: '', amount: '', currency: 'PLN', note: '' };

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.72)',
  backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};

const card = {
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 12,
  width: '100%', maxWidth: 400,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  overflow: 'hidden',
};

export default function AddDividendModal({ isOpen, onClose, onSave, initialData = null }) {
  const { portfolio } = useApp();
  const t = useT();
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (isOpen) {
      setForm(initialData
        ? { symbol: initialData.symbol, exDate: initialData.exDate, payDate: initialData.payDate ?? '',
            amount: String(initialData.amount ?? ''), currency: initialData.currency ?? 'PLN', note: initialData.note ?? '' }
        : EMPTY
      );
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const symbols = [...new Set(portfolio.map(p => p.symbol))].sort();

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  function handleSave() {
    if (!form.symbol || !form.exDate || !form.amount) return;
    onSave({
      symbol: form.symbol, exDate: form.exDate,
      payDate: form.payDate || null,
      amount: parseFloat(form.amount),
      currency: form.currency, note: form.note.trim(),
    });
    onClose();
  }

  return (
    <div style={overlay}>
      <div style={card} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {initialData?.id ? t('edit_dividend_title') : t('add_dividend_title')}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
          >×</button>
        </div>

        {/* Form */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="field-label">{t('col_company')}</label>
            <select className="field-input" value={form.symbol} onChange={e => set('symbol', e.target.value)}>
              <option value="">—</option>
              {symbols.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="field-label">{t('ex_date_label')}</label>
            <input type="date" className="field-input" value={form.exDate} onChange={e => set('exDate', e.target.value)} />
          </div>

          <div>
            <label className="field-label">{t('pay_date_label')}</label>
            <input type="date" className="field-input" value={form.payDate} onChange={e => set('payDate', e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">{t('amount_per_share')}</label>
              <input
                type="number" min="0" step="0.01"
                className="field-input"
                placeholder="0.00"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
              />
            </div>
            <div style={{ width: 90 }}>
              <label className="field-label">{t('currency_label')}</label>
              <select className="field-input" value={form.currency} onChange={e => set('currency', e.target.value)}>
                {['PLN', 'USD', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="field-label">{t('note_label')}</label>
            <input
              type="text" className="field-input"
              placeholder="np. wypłata za 2025"
              maxLength={120}
              value={form.note}
              onChange={e => set('note', e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!form.symbol || !form.exDate || !form.amount}
          >
            {t('save_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}
