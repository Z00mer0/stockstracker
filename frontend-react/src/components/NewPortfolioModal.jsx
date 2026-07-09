import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../context/LanguageContext';

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.72)',
  backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};

const card = {
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 380,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
};

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];
const ACCOUNT_TYPES = ['', 'IKE', 'IKZE'];

export default function NewPortfolioModal({ onClose }) {
  const { createPortfolio } = useApp();
  const t = useT();
  const [name, setName]         = useState('');
  const [currency, setCurrency] = useState('PLN');
  const [accountType, setAccountType] = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function handleSave() {
    if (!name.trim()) { setError(t('err_enter_portfolio_name')); return; }
    setSaving(true); setError('');
    try {
      await createPortfolio(name.trim(), currency, accountType);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || e.message || t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          {t('new_portfolio_title')}
        </h2>

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {t('portfolio_name')}
        </label>
        <input
          autoFocus
          style={{
            width: '100%', padding: '8px 12px', marginBottom: 14,
            background: 'var(--panel-2)', border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 13, color: 'var(--text)', outline: 'none',
            boxSizing: 'border-box',
          }}
          placeholder="np. XTB GPW, IBKR USA"
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {t('base_currency')}
        </label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {CURRENCIES.map(c => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              style={{
                flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 600,
                border: `1px solid ${currency === c ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 7, cursor: 'pointer',
                background: currency === c ? 'var(--accent)' : 'var(--panel-2)',
                color: currency === c ? '#051a10' : 'var(--text-dim)',
                transition: 'all 0.1s',
              }}
            >{c}</button>
          ))}
        </div>

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {t('account_type_label')}
        </label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {ACCOUNT_TYPES.map(at => (
            <button
              key={at || 'std'}
              onClick={() => setAccountType(at)}
              style={{
                flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 600,
                border: `1px solid ${accountType === at ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 7, cursor: 'pointer',
                background: accountType === at ? 'var(--accent)' : 'var(--panel-2)',
                color: accountType === at ? '#051a10' : 'var(--text-dim)',
                transition: 'all 0.1s',
              }}
            >{at || t('account_type_standard')}</button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 16 }}>{t('account_type_hint')}</p>

        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? t('creating') : t('create_portfolio')}
          </button>
        </div>
      </div>
    </div>
  );
}
