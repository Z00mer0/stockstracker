// src/pages/Watchlist.jsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import { useChart } from '../context/ChartContext';
import StockDetailModal from '../components/StockDetailModal';
import Card from '../components/shared/Card';
import Chip from '../components/shared/Chip';
import TickerLogo from '../components/shared/TickerLogo';
import PushToggle from '../components/PushToggle';

const WATCH_KEY = 'myfund_watchlist';
function authHeader() { return { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' }; }

async function apiLoadWatchlist() {
  const r = await fetch('/api/watchlist', { headers: authHeader(), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiSaveWatchlist(items) {
  await fetch('/api/watchlist', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(items),
    signal: AbortSignal.timeout(8000),
  });
}

async function fetchLivePrice(sym) {
  try {
    const q = await fetch(`/api/finnhub/v1/quote?symbol=${sym}`, { signal: AbortSignal.timeout(8000), headers: authHeader() }).then(r => r.json());
    if (q?.c > 0) return { price: q.c, dailyChg: q.dp ?? null };
  } catch {}
  try {
    const yfUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
    const json = await fetch(`/api/proxy?url=${encodeURIComponent(yfUrl)}`, { signal: AbortSignal.timeout(8000), headers: authHeader() }).then(r => r.json());
    const meta = json?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice) {
      const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
      return { price: meta.regularMarketPrice, dailyChg: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : null };
    }
  } catch {}
  return null;
}

function loadWatchlist() { try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); } catch { return []; } }
function saveWatchlist(items) { localStorage.setItem(WATCH_KEY, JSON.stringify(items)); }
function genId() { return Math.random().toString(36).slice(2, 10); }

function AlertModal({ item, onClose, onSave, livePrice }) {
  const t = useT();
  const [type, setType] = useState('above');
  const [price, setPrice] = useState(livePrice?.price != null ? String(livePrice.price.toFixed(2)) : '');
  function handleAdd() {
    if (!price || isNaN(parseFloat(price))) return;
    const target = parseFloat(price);
    const currentPrice = livePrice?.price ?? item.addedPrice ?? 0;
    const triggered = (type === 'above' && currentPrice >= target) || (type === 'below' && currentPrice <= target);
    onSave({ id: genId(), type, targetPrice: target, triggered });
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" style={{ width: 340, padding: 24 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🔔 Alert cenowy — {item.symbol}</h2>
        {livePrice?.price != null
          ? <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 16 }}>Aktualna cena: {livePrice.price.toFixed(2)} {item.currency}</p>
          : item.addedPrice != null && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 16 }}>{item.addedPrice.toFixed(2)} {item.currency}</p>
        }
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['above', 'below'].map(tp => (
            <button key={tp} onClick={() => setType(tp)} className={`btn ${type === tp ? 'btn-primary' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
              {tp === 'above' ? t('above_alert') : t('below_alert')}
            </button>
          ))}
        </div>
        <input type="number" placeholder={t('col_price')} value={price} onChange={e => setPrice(e.target.value)}
          className="field-input" style={{ marginBottom: 20 }} autoFocus />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="btn" style={{ flex: 1, justifyContent: 'center' }}>{t('cancel')}</button>
          <button onClick={handleAdd} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{t('add_btn')}</button>
        </div>
      </div>
    </div>
  );
}

export default function Watchlist() {
  const { portfolio } = useApp();
  const { openChart } = useChart();
  const { locale } = useLanguage();
  const t = useT();
  const [watchItems, setWatchItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [alertTarget, setAlertTarget] = useState(null);
  const [livePrices, setLivePrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [inputTicker, setInputTicker] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('myfund_auth_token');
    if (token) {
      apiLoadWatchlist()
        .then(data => { if (Array.isArray(data)) setWatchItems(data); else setWatchItems(loadWatchlist()); })
        .catch(() => setWatchItems(loadWatchlist()))
        .finally(() => setInitialized(true));
    } else {
      setWatchItems(loadWatchlist());
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (!initialized) return;
    saveWatchlist(watchItems);
    const token = localStorage.getItem('myfund_auth_token');
    if (token) apiSaveWatchlist(watchItems).catch(() => {});
  }, [watchItems, initialized]);

  useEffect(() => {
    if (!watchItems.length) return;
    setLoading(true);
    const symbols = [...new Set(watchItems.map(w => w.symbol))];
    Promise.allSettled(symbols.map(async sym => ({ sym, data: await fetchLivePrice(sym) }))).then(results => {
      const prices = {};
      results.forEach(r => { if (r.status === 'fulfilled' && r.value.data) prices[r.value.sym] = r.value.data; });
      setLivePrices(prices);
    }).finally(() => setLoading(false));
  }, [watchItems.length]);

  async function addWatchItem() {
    const sym = inputTicker.trim().toUpperCase();
    if (!sym) return;
    if (watchItems.some(w => w.symbol === sym)) { setInputTicker(''); return; }
    setAdding(true);
    const newItem = { id: genId(), symbol: sym, name: sym, alerts: [] };
    setWatchItems(prev => [...prev, newItem]);
    setInputTicker('');
    const liveData = await fetchLivePrice(sym);
    if (liveData) setLivePrices(prev => ({ ...prev, [sym]: liveData }));
    setAdding(false);
  }

  function addAlert(itemId, alert) {
    setWatchItems(prev => prev.map(w => w.id === itemId ? { ...w, alerts: [...(w.alerts ?? []), alert] } : w));
    setAlertTarget(null);
  }
  function removeAlert(itemId, alertId) {
    setWatchItems(prev => prev.map(w => w.id === itemId ? { ...w, alerts: (w.alerts ?? []).filter(a => a.id !== alertId) } : w));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title={`${t('watched_companies')}${watchItems.length ? ` · ${watchItems.length}` : ''}`}
        actions={<>
          {loading && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('loading_quotes')}</span>}
          <PushToggle />
        </>}
      >
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0' }}>
          <input
            className="field-input"
            style={{ flex: 1, maxWidth: 220 }}
            placeholder="np. AAPL, PKN.WA"
            value={inputTicker}
            onChange={e => setInputTicker(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addWatchItem()}
            autoComplete="off"
          />
          <button
            className="btn btn-primary"
            onClick={addWatchItem}
            disabled={adding || !inputTicker.trim()}
          >
            {adding ? '…' : t('add_btn') || 'Dodaj'}
          </button>
        </div>
        {!watchItems.length ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-dim)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>{t('watched_synced')}</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('col_symbol')}</th>
                  <th className="right">{t('col_added_price')}</th>
                  <th className="right">{t('col_price')}</th>
                  <th className="right">{t('col_day')}</th>
                  <th>{t('col_note')}</th>
                  <th className="right">Alerts</th>
                </tr>
              </thead>
              <tbody>
                {watchItems.map(w => {
                  const live = livePrices[w.symbol];
                  return (
                    <tr key={w.id ?? w.symbol} onClick={() => setSelectedItem({ symbol: w.symbol, name: w.name })}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <TickerLogo symbol={w.symbol} />
                          <div>
                            <div className="mono" style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{w.symbol}</div>
                            {w.name && w.name !== w.symbol && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{w.name}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="right mono" style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                        {w.addedPrice != null ? `${w.addedPrice.toFixed(2)} ${w.currency ?? ''}` : '—'}
                      </td>
                      <td className="right mono" style={{ fontWeight: 600, fontSize: 13 }}>
                        {loading && !live ? <span style={{ color: 'var(--text-faint)' }}>…</span>
                          : live ? `${live.price.toFixed(2)} ${w.currency ?? ''}` : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                      </td>
                      <td className="right">
                        {live?.dailyChg != null ? <Chip value={live.dailyChg} /> : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-faint)' }}>{w.note || '—'}</td>
                      <td className="right" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
                          {(w.alerts ?? []).map(a => (
                            <button key={a.id} onClick={() => removeAlert(w.id, a.id)}
                              className={`chip ${a.triggered ? 'chip-warn' : a.type === 'above' ? 'chip-up' : 'chip-down'}`}
                              style={{ cursor: 'pointer', textDecoration: a.triggered ? 'line-through' : 'none', border: 'none' }}
                              title={t('click_to_remove')}>
                              {a.type === 'above' ? '↑' : '↓'} {a.targetPrice?.toFixed(2)}
                            </button>
                          ))}
                          <button onClick={() => setAlertTarget(w)} title="Ustaw alert cenowy"
                            style={{ cursor: 'pointer', border: 'none', background: 'transparent', padding: '2px 4px', fontSize: 16, lineHeight: 1, opacity: (w.alerts ?? []).length > 0 ? 1 : 0.5, color: (w.alerts ?? []).length > 0 ? '#f59e0b' : 'inherit', transition: 'opacity 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.opacity = 1}
                            onMouseLeave={e => e.currentTarget.style.opacity = (w.alerts ?? []).length > 0 ? 1 : 0.5}>🔔</button>
                          <button
                            onClick={() => setWatchItems(prev => prev.filter(x => x.id !== w.id))}
                            className="chip"
                            style={{ cursor: 'pointer', border: 'none', color: 'var(--text-faint)' }}
                            title="Usuń z watchlisty"
                          >✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {portfolio.length > 0 && (
        <Card title={t('owned_companies')}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('col_symbol')}</th>
                  <th className="right">{t('col_qty')}</th>
                  <th className="right">{t('col_avg_price_short')}</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map(pos => (
                  <tr key={pos.id ?? pos.symbol} onClick={() => setSelectedItem(pos)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <TickerLogo symbol={pos.symbol} />
                        <div>
                          <div className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{pos.symbol}</div>
                          {pos.name && pos.name !== pos.symbol && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{pos.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="right mono" style={{ fontSize: 13 }}>{pos.qty?.toLocaleString(locale) ?? '—'}</td>
                    <td className="right mono" style={{ fontSize: 13, color: 'var(--text-dim)' }}>{pos.avgPrice?.toFixed(2)} {pos.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {alertTarget && (
        <AlertModal item={alertTarget} onClose={() => setAlertTarget(null)} onSave={alert => addAlert(alertTarget.id, alert)} livePrice={livePrices[alertTarget?.symbol]} />
      )}
      {selectedItem && (
        <StockDetailModal
          item={selectedItem}
          existingPortfolio={portfolio}
          onSave={async () => {}}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
