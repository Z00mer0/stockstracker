// src/pages/Settings.jsx
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../hooks/useApi';
import { getMdApiKey, setMdApiKey } from '../services/MarketDataService';
import { US_TAX_KEY } from '../services/dividendService';
import BrokerImportModal from '../components/BrokerImportModal';
import Card from '../components/shared/Card';

function SettingsRow({ label, value, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{label}</span>
      {children || <span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>{value}</span>}
    </div>
  );
}

function ApiKeySection() {
  const [key, setKey] = useState(getMdApiKey);
  const [saved, setSaved] = useState(false);
  const isSet = !!getMdApiKey();

  function save() { setMdApiKey(key); setSaved(true); setTimeout(() => setSaved(false), 2000); }

  return (
    <Card title="Klucze API">
      <div className="card-body">
        <SettingsRow label={<span>MarketData.app <span style={{ fontWeight: 400, fontSize: 11, color: isSet ? 'var(--up)' : 'var(--warn)', marginLeft: 6 }}>{isSet ? '✓ ustawiony' : 'nie ustawiony'}</span></span>}>
          <div style={{ display: 'flex', gap: 8, flex: 1, maxWidth: 360 }}>
            <input type="password" value={key} onChange={e => setKey(e.target.value)}
              className="field-input mono" style={{ flex: 1, minWidth: 0, fontSize: 12 }} placeholder="Wklej klucz…" />
            <button onClick={save} className={`btn ${saved ? '' : 'btn-primary'}`} style={{ fontSize: 12 }}>
              {saved ? '✓ Zapisano' : 'Zapisz'}
            </button>
          </div>
        </SettingsRow>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>
          Klucz przechowywany tylko lokalnie. Darmowy klucz: marketdata.app
        </p>
      </div>
    </Card>
  );
}

function ChangePasswordSection() {
  const [form, setForm] = useState({ current: '', next: '', next2: '' });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.next !== form.next2) { setError('Nowe hasła nie są identyczne'); return; }
    setLoading(true);
    try {
      await api.post('/api/change-password', { current_password: form.current, new_password: form.next });
      setSuccess(true);
      setForm({ current: '', next: '', next2: '' });
    } catch (err) {
      setError(err.response?.data?.error ?? 'Błąd zmiany hasła');
    } finally { setLoading(false); }
  }

  return (
    <Card title="Zmiana hasła">
      <form onSubmit={handleSubmit} className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[['Aktualne hasło', 'current', 'current-password'], ['Nowe hasło', 'next', 'new-password'], ['Powtórz nowe', 'next2', 'new-password']].map(([label, field, ac]) => (
          <div key={field}>
            <label className="field-label">{label}</label>
            <input type="password" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              autoComplete={ac} className="field-input" />
          </div>
        ))}
        {error && <p style={{ color: 'var(--down)', fontSize: 12 }}>{error}</p>}
        {success && <p style={{ color: 'var(--up)', fontSize: 12 }}>Hasło zostało zmienione ✓</p>}
        <button type="submit" className="btn btn-primary"
          disabled={loading || !form.current || !form.next || !form.next2}
          style={{ alignSelf: 'flex-start', opacity: (loading || !form.current || !form.next || !form.next2) ? 0.4 : 1 }}>
          {loading ? 'Zapisywanie…' : 'Zmień hasło'}
        </button>
      </form>
    </Card>
  );
}

function DividendTaxSection() {
  const [usTax, setUsTax] = useState(() => localStorage.getItem(US_TAX_KEY) || '15');
  function save(val) { setUsTax(val); localStorage.setItem(US_TAX_KEY, val); }

  return (
    <Card title="Podatek od dywidend">
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SettingsRow label="GPW (.WA)" value="19% ryczałt (stała)" />
        <div>
          <label className="field-label">Akcje US</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ val: '15', label: '15%', desc: 'Umowa PL-US' }, { val: '30', label: '30%', desc: 'Pełny withholding' }].map(opt => (
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

export default function Settings() {
  const { displayName, logout, refresh, fxRates, transactions, importBrokerTransactions, clearBrokerImport } = useApp();
  const apiUrl = import.meta.env.VITE_API_URL ?? '(proxy lokalny)';
  const [showBrokerImport, setShowBrokerImport] = useState(false);
  const [clearing, setClearing] = useState(false);

  const importedCount = transactions.filter(t => String(t.note ?? '').startsWith('Import brokera')).length;

  async function handleClearImport() {
    if (!window.confirm(`Usuń ${importedCount} transakcji importu brokera? Portfel pozostaje bez zmian.`)) return;
    setClearing(true);
    try { await clearBrokerImport(); refresh(); } finally { setClearing(false); }
  }

  return (
    <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="Konto">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <SettingsRow label="Zalogowany jako" value={displayName || '—'} />
          <SettingsRow label="API URL">
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apiUrl}</span>
          </SettingsRow>
          <div style={{ paddingTop: 14, display: 'flex', gap: 8 }}>
            <button onClick={refresh} className="btn btn-primary" style={{ fontSize: 12 }}>Odśwież dane</button>
            <button onClick={logout} className="btn" style={{ fontSize: 12 }}>Wyloguj →</button>
          </div>
        </div>
      </Card>

      <ChangePasswordSection />
      <ApiKeySection />
      <DividendTaxSection />

      <Card title="Import danych brokera">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Importuj historię z pliku CSV (eToro itp.). Obsługiwane: Closed Positions, Cash Operations.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setShowBrokerImport(true)} className="btn btn-primary" style={{ fontSize: 12 }}>
              ↑ Importuj CSV brokera
            </button>
            {importedCount > 0 && (
              <button onClick={handleClearImport} disabled={clearing} className="btn" style={{ fontSize: 12, color: 'var(--down)' }}>
                {clearing ? 'Usuwanie…' : `✕ Cofnij import (${importedCount} transakcji)`}
              </button>
            )}
          </div>
          {importedCount > 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              {importedCount} transakcji z importu brokera · cofnięcie usuwa je i pozwala zaimportować ponownie
            </p>
          )}
        </div>
      </Card>

      <Card title="Kursy walut">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {['USD', 'EUR', 'GBP'].map(cur => (
            <SettingsRow key={cur} label={`${cur} / PLN`}>
              <span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>
                {fxRates[cur] != null ? fxRates[cur].toFixed(4) : '—'} zł
              </span>
            </SettingsRow>
          ))}
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>Aktualizowane co 30 min (frankfurter.app)</p>
        </div>
      </Card>

      <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '4px 0' }}>
        StocksTracker — Vite + React. Dane: Render (PostgreSQL).
      </div>

      {showBrokerImport && (
        <BrokerImportModal
          existingTransactions={transactions}
          onSave={async (newTxs) => { await importBrokerTransactions(newTxs); refresh(); }}
          onClose={() => setShowBrokerImport(false)}
        />
      )}
    </div>
  );
}
