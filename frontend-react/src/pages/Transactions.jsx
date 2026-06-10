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
      setError(e.message || t('save_error'));
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

export default function Transactions() {
  const { transactions = [], loading, saveTransactions, activePortfolioId } = useApp();
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
            <div className="kpi-value" style={{ fontSize: 20 }}>{fmtMoney(value, 'PLN', locale)}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <Card
        title={`Transakcje · ${sorted.length}`}
        actions={
          <button
            onClick={() => setShowAdd(true)}
            style={{ padding: '5px 12px', borderRadius: 6, background: 'var(--info)', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {t('add_btn')}
          </button>
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
          onSave={async (tx) => { await saveTransactions([...transactions, tx]); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
