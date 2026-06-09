// src/pages/Settings.jsx
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../hooks/useApi';
import { getMdApiKey, setMdApiKey } from '../services/MarketDataService';
import { US_TAX_KEY } from '../services/dividendService';
import BrokerImportModal from '../components/BrokerImportModal';
import Card from '../components/shared/Card';
import { useLanguage, useT } from '../context/LanguageContext';

function SettingsRow({ label, value, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{label}</span>
      {children || <span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>{value}</span>}
    </div>
  );
}

function ApiKeySection() {
  const t = useT();
  const [key, setKey] = useState(getMdApiKey);
  const [saved, setSaved] = useState(false);
  const isSet = !!getMdApiKey();

  function save() { setMdApiKey(key); setSaved(true); setTimeout(() => setSaved(false), 2000); }

  return (
    <Card title={t('api_keys')}>
      <div className="card-body">
        <SettingsRow label={<span>MarketData.app <span style={{ fontWeight: 400, fontSize: 11, color: isSet ? 'var(--up)' : 'var(--warn)', marginLeft: 6 }}>{isSet ? '✓ ustawiony' : 'nie ustawiony'}</span></span>}>
          <div style={{ display: 'flex', gap: 8, flex: 1, maxWidth: 360 }}>
            <input type="password" value={key} onChange={e => setKey(e.target.value)}
              className="field-input mono" style={{ flex: 1, minWidth: 0, fontSize: 12 }} placeholder={t('api_key_placeholder')} />
            <button onClick={save} className={`btn ${saved ? '' : 'btn-primary'}`} style={{ fontSize: 12 }}>
              {saved ? t('saved_ok') : t('save_btn')}
            </button>
          </div>
        </SettingsRow>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>
          {t('api_key_info')} Darmowy klucz: marketdata.app
        </p>
      </div>
    </Card>
  );
}

function ChangePasswordSection() {
  const t = useT();
  const [form, setForm] = useState({ current: '', next: '', next2: '' });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.next !== form.next2) { setError(t('passwords_mismatch')); return; }
    setLoading(true);
    try {
      await api.post('/api/change-password', { current_password: form.current, new_password: form.next });
      setSuccess(true);
      setForm({ current: '', next: '', next2: '' });
    } catch (err) {
      setError(err.response?.data?.error ?? t('password_error'));
    } finally { setLoading(false); }
  }

  return (
    <Card title={t('change_password')}>
      <form onSubmit={handleSubmit} className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[[t('current_password'), 'current', 'current-password'], [t('new_password'), 'next', 'new-password'], [t('repeat_new_password'), 'next2', 'new-password']].map(([label, field, ac]) => (
          <div key={field}>
            <label className="field-label">{label}</label>
            <input type="password" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              autoComplete={ac} className="field-input" />
          </div>
        ))}
        {error && <p style={{ color: 'var(--down)', fontSize: 12 }}>{error}</p>}
        {success && <p style={{ color: 'var(--up)', fontSize: 12 }}>{t('password_changed')}</p>}
        <button type="submit" className="btn btn-primary"
          disabled={loading || !form.current || !form.next || !form.next2}
          style={{ alignSelf: 'flex-start', opacity: (loading || !form.current || !form.next || !form.next2) ? 0.4 : 1 }}>
          {loading ? t('saving_btn') : t('change_password_btn')}
        </button>
      </form>
    </Card>
  );
}

function DividendTaxSection() {
  const t = useT();
  const [usTax, setUsTax] = useState(() => localStorage.getItem(US_TAX_KEY) || '15');
  function save(val) { setUsTax(val); localStorage.setItem(US_TAX_KEY, val); }

  return (
    <Card title={t('dividend_tax')}>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SettingsRow label={t('gpw_tax')} value={t('gpw_tax_value')} />
        <div>
          <label className="field-label">{t('us_stocks')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ val: '15', label: '15%', desc: t('agreement_pl_us') }, { val: '30', label: '30%', desc: t('full_withholding') }].map(opt => (
              <button key={opt.val} onClick={() => save(opt.val)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, textAlign: 'left',
                  border: `1px solid ${usTax === opt.val ? 'var(--accent)' : 'var(--border)'}`,
                  background: usTax === opt.val ? 'var(--up-soft)' : 'var(--panel-2)',
                  cursor: 'pointer',
                }}
              >
                <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: usTax === opt.val ? 'var(--up)' : 'var(--text)', marginBottom: 2 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function SnapshotManagerSection() {
  const t = useT();
  const { locale } = useLanguage();
  const { snapshots, setSnapshot, deleteSnapshot } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, total: '', invested: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingDate, setEditingDate] = useState(null);

  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => b.date.localeCompare(a.date)),
    [snapshots]
  );

  function startEdit(s) {
    setEditingDate(s.date);
    setForm({ date: s.date, total: String(s.total ?? ''), invested: String(s.invested ?? '') });
  }

  function cancelEdit() {
    setEditingDate(null);
    setForm({ date: today, total: '', invested: '' });
  }

  async function handleSave() {
    const total = parseFloat(form.total);
    const inv   = parseFloat(form.invested);
    if (!form.date || isNaN(total) || total < 0) return;
    setSaving(true);
    try {
      await setSnapshot(form.date, total, isNaN(inv) ? undefined : inv);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditingDate(null);
      setForm({ date: today, total: '', invested: '' });
    } finally {
      setSaving(false);
    }
  }

  const isEditing = editingDate !== null;

  return (
    <Card title={t('portfolio_snapshots')}>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Form */}
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
            {isEditing ? `${t('editing_snapshot')} ${fmtDate(editingDate)}` : t('add_new_snapshot')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 8 }}>
            <div>
              <label className="field-label">Data</label>
              <input
                type="date"
                className="field-input"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                disabled={isEditing}
                style={{ fontSize: 12 }}
              />
            </div>
            <div>
              <label className="field-label">{t('portfolio_val_zl')}</label>
              <input
                type="number" min="0" step="any"
                className="field-input mono"
                style={{ fontSize: 12 }}
                placeholder="np. 35000"
                value={form.total}
                onChange={e => setForm(f => ({ ...f, total: e.target.value }))}
              />
            </div>
            <div>
              <label className="field-label">{t('invested_zl')}</label>
              <input
                type="number" min="0" step="any"
                className="field-input mono"
                style={{ fontSize: 12 }}
                placeholder="np. 20000"
                value={form.invested}
                onChange={e => setForm(f => ({ ...f, invested: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving || !form.date || form.total === ''}
              className={`btn ${saved ? '' : 'btn-primary'}`}
              style={{ fontSize: 12, opacity: (!form.date || form.total === '') ? 0.4 : 1 }}
            >
              {saved ? t('saved_ok') : saving ? t('saving') : isEditing ? t('save_changes') : t('add_snapshot')}
            </button>
            {isEditing && (
              <button onClick={cancelEdit} className="btn" style={{ fontSize: 12 }}>{t('cancel_btn')}</button>
            )}
          </div>
        </div>

        {/* List */}
        {sorted.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {t('existing_snapshots')} ({sorted.length})
            </p>
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sorted.map(s => (
                <div
                  key={s.date}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 12px', borderRadius: 8,
                    background: editingDate === s.date ? 'var(--up-soft)' : 'var(--panel-2)',
                    border: editingDate === s.date ? '1px solid var(--up)' : '1px solid transparent',
                  }}
                >
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-dim)', width: 72, flexShrink: 0 }}>{fmtDate(s.date)}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>
                    {s.total != null ? s.total.toLocaleString(locale, { maximumFractionDigits: 0 }) + ' zł' : '—'}
                  </span>
                  {s.invested != null && (
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      inw. {s.invested.toLocaleString(locale, { maximumFractionDigits: 0 })} zł
                    </span>
                  )}
                  <button
                    onClick={() => startEdit(s)}
                    title={t('edit')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-faint)', padding: '2px 5px' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}
                  >✏</button>
                  <button
                    onClick={() => { if (window.confirm(`${t('delete_snapshot_confirm')} ${fmtDate(s.date)}?`)) deleteSnapshot(s.date); }}
                    title={t('delete_btn')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-faint)', padding: '2px 5px' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--down)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function Settings() {
  const { displayName, logout, refresh, fxRates, transactions, portfolio, cash, importBrokerTransactions, clearBrokerImport } = useApp();
  const { language, locale, setLanguage } = useLanguage();
  const t = useT();
  const apiUrl = import.meta.env.VITE_API_URL ?? '(proxy lokalny)';
  const [showBrokerImport, setShowBrokerImport] = useState(false);
  const [clearingId, setClearingId] = useState(null);

  // Group imported transactions by importId (or legacy "no importId" group)
  const importBatches = (() => {
    const byId = {};
    for (const tx of transactions) {
      if (!String(tx.note ?? '').startsWith('Import brokera')) continue;
      const key = tx.importId || 'legacy';
      if (!byId[key]) byId[key] = { importId: tx.importId || null, count: 0, dates: [] };
      byId[key].count++;
      if (tx.date) byId[key].dates.push(tx.date);
    }
    return Object.values(byId).map(b => ({
      ...b,
      label: b.importId
        ? new Date(parseInt(b.importId.replace('imp_', ''))).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Poprzedni import (bez daty)',
    }));
  })();

  async function handleClearImport(importId, count) {
    if (!window.confirm(`${t('delete')} ${count} ${t('delete_import_confirm')}`)) return;
    setClearingId(importId || 'legacy');
    try { await clearBrokerImport(importId); } finally { setClearingId(null); }
  }

  return (
    <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Language section ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>{t('language_section')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn${language === 'pl' ? ' btn-primary' : ''}`}
            onClick={() => setLanguage('pl')}
          >
            🇵🇱 Polski
          </button>
          <button
            className={`btn${language === 'en' ? ' btn-primary' : ''}`}
            onClick={() => setLanguage('en')}
          >
            🇬🇧 English
          </button>
        </div>
      </div>

      <Card title={t('account')}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <SettingsRow label={t('logged_in_as')} value={displayName || '—'} />
          <SettingsRow label="API URL">
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apiUrl}</span>
          </SettingsRow>
          <div style={{ paddingTop: 14, display: 'flex', gap: 8 }}>
            <button onClick={refresh} className="btn btn-primary" style={{ fontSize: 12 }}>{t('refresh_data')}</button>
            <button onClick={logout} className="btn" style={{ fontSize: 12 }}>{t('logout')}</button>
          </div>
        </div>
      </Card>

      <ChangePasswordSection />
      <ApiKeySection />
      <DividendTaxSection />

      <Card title={t('broker_import')}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {t('import_csv')}
          </p>
          <button onClick={() => setShowBrokerImport(true)} className="btn btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>
            {t('import_csv_btn')}
          </button>
          {importBatches.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{t('import_history')}</p>
              {importBatches.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', background: 'var(--panel-2)', borderRadius: 8 }}>
                  <div>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{b.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 8 }}>{b.count} {t('transactions_short')}</span>
                  </div>
                  <button
                    onClick={() => handleClearImport(b.importId, b.count)}
                    disabled={clearingId === (b.importId || 'legacy')}
                    className="btn"
                    style={{ fontSize: 11, color: 'var(--down)', padding: '3px 10px' }}
                  >
                    {clearingId === (b.importId || 'legacy') ? t('deleting') : `✕ ${t('undo')}`}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <SnapshotManagerSection />

      <Card title={t('currency_rates')}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {['USD', 'EUR', 'GBP'].map(cur => (
            <SettingsRow key={cur} label={`${cur} / PLN`}>
              <span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>
                {fxRates[cur] != null ? fxRates[cur].toFixed(4) : '—'} zł
              </span>
            </SettingsRow>
          ))}
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>{t('currency_rates_info')}</p>
        </div>
      </Card>

      <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '4px 0' }}>
        StocksTracker — Vite + React. Dane: Render (PostgreSQL).
      </div>

      {showBrokerImport && (
        <BrokerImportModal
          existingTransactions={transactions}
          existingPortfolio={portfolio}
          existingCash={cash}
          onSave={async (newTxs) => { await importBrokerTransactions(newTxs); }}
          onClose={() => setShowBrokerImport(false)}
        />
      )}
    </div>
  );
}
