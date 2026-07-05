// src/pages/Transactions.jsx
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useLanguage, useT } from '../context/LanguageContext';
import Card from '../components/shared/Card';
import Chip from '../components/shared/Chip';
import TickerLogo from '../components/shared/TickerLogo';
import SegmentedControl from '../components/shared/SegmentedControl';
import Spinner from '../components/shared/Spinner';

const TAG_CLASS  = { BUY: 'tag-buy', SELL: 'tag-sell', DIV: 'tag-div', DIVIDEND: 'tag-div', CASH: 'tag-fee' };
const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };

function fmtDate(d, locale = 'pl-PL') {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtMoney(v, cur = 'PLN', locale = 'pl-PL') {
  if (v == null) return '—';
  return Number(v).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur;
}
function fmt(n, decimals = 2, locale = 'pl-PL') {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function AddTransactionModal({ onSave, onClose }) {
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

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  async function handleSave() {
    if (!form.symbol.trim()) { setError(t('err_enter_symbol')); return; }
    const qty   = form.type === 'CASH' ? null : parseFloat(form.qty);
    const price = parseFloat(form.price);
    if (form.type !== 'CASH' && (isNaN(qty) || qty <= 0)) { setError(t('err_enter_qty_short')); return; }
    if (isNaN(price) || price < 0) { setError(t('err_enter_price_short')); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        id: Math.random().toString(36).slice(2, 10),
        type: form.type,
        symbol: form.symbol.trim().toUpperCase(),
        qty: form.type === 'CASH' ? null : qty,
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

  const showQty = form.type !== 'CASH';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
         onClick={onClose}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }}
           onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>{t('add_transaction_title')}</h2>

        {/* Typ */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {['BUY', 'SELL', 'DIV', 'CASH'].map(tp => (
            <button key={tp} onClick={() => set('type', tp)}
              style={{
                flex: 1, padding: '6px 4px', borderRadius: 8, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: form.type === tp
                  ? tp === 'BUY' ? 'var(--up)' : tp === 'SELL' ? 'var(--down)' : tp === 'DIV' ? 'var(--warn)' : 'var(--info)'
                  : 'var(--border)',
                color: form.type === tp ? '#fff' : 'var(--text-dim)',
              }}>
              {tp === 'BUY' ? t('type_buy') : tp === 'SELL' ? t('type_sell') : tp === 'DIV' ? t('type_div') : t('type_cash')}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Symbol */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>{t('col_symbol')}</label>
            <input type="text" placeholder="np. AAPL, CDR.WA"
              value={form.symbol} onChange={e => set('symbol', e.target.value)}
              style={{ width: '100%', background: 'var(--bg, #0d1117)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase' }}
            />
          </div>

          {/* Qty + Price */}
          <div style={{ display: 'grid', gridTemplateColumns: showQty ? '1fr 1fr' : '1fr', gap: 12 }}>
            {showQty && (
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>{t('qty_short')}</label>
                <input type="number" min="0" step="any" placeholder="0"
                  value={form.qty} onChange={e => set('qty', e.target.value)}
                  style={{ width: '100%', background: 'var(--bg, #0d1117)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                {form.type === 'CASH' ? t('col_value') : t('price_label')}
              </label>
              <input type="number" min="0" step="any" placeholder="0.00"
                value={form.price} onChange={e => set('price', e.target.value)}
                style={{ width: '100%', background: 'var(--bg, #0d1117)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Currency + Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>{t('currency_label')}</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)}
                style={{ width: '100%', background: 'var(--bg, #0d1117)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}>
                {['PLN', 'USD', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>{t('col_date')}</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                style={{ width: '100%', background: 'var(--bg, #0d1117)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>{t('note_optional')}</label>
            <input type="text" placeholder=""
              value={form.note} onChange={e => set('note', e.target.value)}
              style={{ width: '100%', background: 'var(--bg, #0d1117)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {error && <p style={{ fontSize: 11, color: 'var(--down)', marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '8px 16px', borderRadius: 8, background: 'var(--border)', color: 'var(--text-dim)', fontSize: 13, border: 'none', cursor: 'pointer' }}>
            {t('cancel')}
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 1, padding: '8px 16px', borderRadius: 8, background: 'var(--info)', color: '#fff', fontSize: 13, border: 'none', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
            {saving ? t('saving_btn') : t('save_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportCSVModal({ existingTransactions, onSave, onClose }) {
  const [rows, setRows] = useState(null);
  const [skipped, setSkipped] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = React.useRef(null);

  const COL_MAP = {
    'data': 'date', 'date': 'date',
    'typ': 'type', 'type': 'type',
    'symbol': 'symbol',
    'ilość': 'qty', 'ilosc': 'qty', 'qty': 'qty',
    'cena': 'price', 'price': 'price',
    'waluta': 'currency', 'currency': 'currency',
    'uwaga': 'note', 'note': 'note',
  };

  function parseCSV(text) {
    // Strip BOM
    const clean = text.replace(/^﻿/, '');
    const lines = clean.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return { valid: [], skippedCount: 0 };

    // Detect delimiter: if first line has more semicolons than commas, use semicolon
    const firstLine = lines[0];
    const delimiter = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

    function splitLine(line) {
      const result = [];
      let inQuote = false;
      let cur = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
          else { inQuote = !inQuote; }
        } else if (ch === delimiter && !inQuote) {
          result.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      result.push(cur);
      return result;
    }

    const headerCols = splitLine(lines[0]).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const fieldMap = headerCols.map(h => COL_MAP[h] ?? null);

    const valid = [];
    let skippedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = splitLine(lines[i]);
      const obj = {};
      fieldMap.forEach((field, idx) => {
        if (field) obj[field] = (cols[idx] ?? '').trim().replace(/^"|"$/g, '');
      });

      const price = parseFloat(obj.price);
      if (!obj.symbol || isNaN(price)) { skippedCount++; continue; }

      valid.push({
        id: Math.random().toString(36).slice(2, 10),
        date: obj.date ?? '',
        type: (obj.type ?? 'BUY').toUpperCase(),
        symbol: obj.symbol.toUpperCase(),
        qty: obj.qty !== '' && obj.qty != null ? parseFloat(obj.qty) || null : null,
        price,
        currency: obj.currency ?? 'PLN',
        note: obj.note ?? '',
      });
    }

    return { valid, skippedCount };
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const { valid, skippedCount } = parseCSV(evt.target.result);
        setRows(valid);
        setSkipped(skippedCount);
      } catch (err) {
        setError('Błąd parsowania pliku CSV.');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  async function handleConfirm() {
    if (!rows || rows.length === 0) return;
    setSaving(true);
    try {
      await onSave([...existingTransactions, ...rows]);
      onClose();
    } catch (e) {
      setError(e.message || 'Błąd zapisu.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
         onClick={onClose}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }}
           onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16, flexShrink: 0 }}>Import CSV</h2>

        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />

        {!rows && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--info)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
              Wybierz plik CSV
            </button>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 12 }}>
              Obsługiwane kolumny: Data, Typ, Symbol, Ilość, Cena, Waluta, Uwaga
            </p>
          </div>
        )}

        {rows && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12, flexShrink: 0 }}>
              <span style={{ color: 'var(--up)', fontWeight: 600 }}>{rows.length} wierszy poprawnych</span>
              {skipped > 0 && <span style={{ color: 'var(--down)', marginLeft: 12 }}>{skipped} pominięto (brak symbolu lub ceny)</span>}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Data</th><th>Typ</th><th>Symbol</th>
                    <th className="right">Ilość</th><th className="right">Cena</th>
                    <th>Waluta</th><th>Uwaga</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '16px 14px' }}>Brak poprawnych wierszy</td></tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ color: 'var(--text-dim)' }}>{r.date}</td>
                      <td><span className={`tag ${TAG_CLASS[r.type] ?? ''}`}>{r.type}</span></td>
                      <td className="mono" style={{ fontWeight: 600 }}>{r.symbol}</td>
                      <td className="right mono">{r.qty ?? '—'}</td>
                      <td className="right mono">{r.price}</td>
                      <td>{r.currency}</td>
                      <td style={{ color: 'var(--text-faint)' }}>{r.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {error && <p style={{ fontSize: 11, color: 'var(--down)', marginTop: 12, flexShrink: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '8px 16px', borderRadius: 8, background: 'var(--border)', color: 'var(--text-dim)', fontSize: 13, border: 'none', cursor: 'pointer' }}>
            Anuluj
          </button>
          {rows && rows.length > 0 && (
            <button onClick={handleConfirm} disabled={saving}
              style={{ flex: 1, padding: '8px 16px', borderRadius: 8, background: 'var(--info)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Zapisywanie…' : `Importuj ${rows.length} transakcji`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Transactions() {
  const { transactions = [], loading, saveTransactions, activePortfolioId, displayCurrency } = useApp();
  const { isPrivate } = usePrivacy();
  const { locale } = useLanguage();
  const t = useT();

  const FILTERS = [
    { value: 'all',  label: t('nav_all') },
    { value: 'BUY',  label: t('type_buy') },
    { value: 'SELL', label: t('type_sell') },
    { value: 'DIV',  label: t('nav_dividends') },
    { value: 'CASH', label: t('type_cash') },
  ];

  const TAG_LABEL = {
    BUY: t('type_buy'), SELL: t('type_sell'),
    DIV: t('type_div'), DIVIDEND: t('type_div'),
    CASH: t('type_cash'),
  };

  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  function handleExportCSV() {
    const headers = [t('col_date'), t('col_type'), 'Symbol', t('qty_short'), t('price_label'), t('col_currency'), t('col_note')];
    const rows = sorted.map(tx => [
      tx.date ?? '',
      tx.type ?? '',
      tx.symbol ?? '',
      tx.qty != null ? tx.qty : '',
      tx.price != null ? tx.price : '',
      tx.currency ?? '',
      tx.note ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `transakcje_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const now = new Date();
  const d30ago = new Date(now - 30 * 24 * 3600 * 1000);

  const stats = useMemo(() => {
    const recent = transactions.filter(t => new Date(t.date) >= d30ago);
    const sum = (type) => recent.filter(t => t.type === type).reduce((a, t) => a + ((t.qty ?? 1) * (t.price ?? 0)), 0);
    return {
      buy: sum('BUY'), sell: sum('SELL'), div: sum('DIV'), cash: sum('CASH'),
    };
  }, [transactions]);

  const filtered = useMemo(() =>
    filter === 'all' ? transactions : transactions.filter(t => t.type === filter),
    [transactions, filter]
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => b.date.localeCompare(a.date)), [filtered]);

  if (loading && !transactions.length) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner size="lg" /></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { labelKey: 'buys_30d',  value: stats.buy  },
          { labelKey: 'sells_30d', value: stats.sell },
          { labelKey: 'divs_30d',  value: stats.div  },
          { labelKey: 'cash_30d',  value: stats.cash },
        ].map(({ labelKey, value }) => (
          <div key={labelKey} className="kpi-card">
            <div className="kpi-label">{t(labelKey)}</div>
            <div className="kpi-value" style={{ fontSize: 20 }}>{fmtMoney(value, displayCurrency, locale)}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <Card
        title={`${t('transactions_label')} · ${sorted.length}`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleExportCSV}
              style={{ padding: '5px 12px', borderRadius: 6, background: 'transparent', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              CSV
            </button>
            <button
              onClick={() => setShowImport(true)}
              style={{ padding: '5px 12px', borderRadius: 6, background: 'transparent', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ⬆ Import CSV
            </button>
            <button
              onClick={() => setShowAdd(true)}
              style={{ padding: '5px 12px', borderRadius: 6, background: 'var(--info)', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {t('add_btn')}
            </button>
          </div>
        }
      >
        <div style={{ overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', paddingBottom: 0 }}>
          <div style={{ padding: '8px 16px' }}>
            <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('col_date')}</th>
                <th>{t('col_type')}</th>
                <th>{t('col_symbol')}</th>
                <th className="right">{t('qty_short')}</th>
                <th className="right">{t('price_label')}</th>
                <th className="right">{t('col_value')}</th>
                <th>{t('col_note')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '32px 14px' }}>{t('no_data')}</td></tr>
              )}
              {sorted.map((tx, i) => {
                const typeKey = tx.type?.toUpperCase();
                const cur = CUR_SYMBOLS[tx.currency] ?? tx.currency ?? '';
                const total = (tx.qty ?? 1) * (tx.price ?? 0);
                return (
                  <tr key={tx.id ?? i}>
                    <td className="mono" style={{ color: 'var(--text-dim)', fontSize: 12 }}>{fmtDate(tx.date, locale)}</td>
                    <td><span className={`tag ${TAG_CLASS[typeKey] ?? ''}`}>{TAG_LABEL[typeKey] ?? typeKey}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TickerLogo symbol={tx.symbol ?? ''} />
                        <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{tx.symbol ?? '—'}</span>
                        {tx.name && tx.name !== tx.symbol && (
                          <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 400 }}>{tx.name}</span>
                        )}
                        {activePortfolioId === 'all' && tx._portfolioName && (
                          <span style={{ fontSize: 10, color: 'var(--text-faint)', padding: '1px 5px', background: 'var(--panel-2)', borderRadius: 4, marginLeft: 4 }}>
                            {tx._portfolioName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="right mono" style={{ fontSize: 13 }}>{tx.qty != null ? fmt(tx.qty, tx.qty % 1 === 0 ? 0 : 4, locale) : '—'}</td>
                    <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                      {tx.price != null ? `${fmt(tx.price, 2, locale)} ${cur}` : '—'}
                    </td>
                    <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ fontSize: 13, fontWeight: 600 }}>
                      {fmt(total, 2, locale)} {cur}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>{tx.note || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {showAdd && (
        <AddTransactionModal
          onSave={async (tx) => { await saveTransactions(prev => [...prev, tx]); }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {showImport && (
        <ImportCSVModal
          existingTransactions={transactions}
          onSave={saveTransactions}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
