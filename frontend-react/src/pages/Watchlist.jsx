// src/pages/Watchlist.jsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useChart } from '../context/ChartContext';
import Card from '../components/shared/Card';
import Chip from '../components/shared/Chip';
import TickerLogo from '../components/shared/TickerLogo';

const WATCH_KEY = 'myfund_watchlist';
function authHeader() { return { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' }; }

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

function AlertModal({ item, onClose, onSave }) {
  const [type, setType] = useState('above');
  const [price, setPrice] = useState('');
  function handleAdd() {
    if (!price || isNaN(parseFloat(price))) return;
    const target = parseFloat(price);
    const triggered = (type === 'above' && (item.addedPrice ?? 0) >= target) || (type === 'below' && (item.addedPrice ?? 0) <= target);
    onSave({ id: genId(), type, targetPrice: target, triggered });
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" style={{ width: 340, padding: 24 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Alert — {item.symbol}</h2>
        {item.addedPrice != null && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 16 }}>Cena przy dodaniu: {item.addedPrice.toFixed(2)} {item.currency}</p>}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['above', 'below'].map(t => (
            <button key={t} onClick={() => setType(t)} className={`btn ${type === t ? 'btn-primary' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
              {t === 'above' ? '↑ Powyżej' : '↓ Poniżej'}
            </button>
          ))}
        </div>
        <input type="number" placeholder="Cena docelowa" value={price} onChange={e => setPrice(e.target.value)}
          className="field-input" style={{ marginBottom: 20 }} autoFocus />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="btn" style={{ flex: 1, justifyContent: 'center' }}>Anuluj</button>
          <button onClick={handleAdd} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Dodaj</button>
        </div>
      </div>
    </div>
  );
}

export default function Watchlist() {
  const { portfolio } = useApp();
  const { openChart } = useChart();
  const [watchItems, setWatchItems] = useState([]);
  const [alertTarget, setAlertTarget] = useState(null);
  const [livePrices, setLivePrices] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => { setWatchItems(loadWatchlist()); }, []);

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

  function addAlert(itemId, alert) {
    setWatchItems(prev => { const u = prev.map(w => w.id === itemId ? { ...w, alerts: [...(w.alerts ?? []), alert] } : w); saveWatchlist(u); return u; });
    setAlertTarget(null);
  }
  function removeAlert(itemId, alertId) {
    setWatchItems(prev => { const u = prev.map(w => w.id === itemId ? { ...w, alerts: (w.alerts ?? []).filter(a => a.id !== alertId) } : w); saveWatchlist(u); return u; });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title={`Obserwowane spółki${watchItems.length ? ` · ${watchItems.length}` : ''}`}
        actions={loading && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Ładowanie kursów…</span>}
      >
        {!watchItems.length ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-dim)' }}>
            <p>Watchlist jest pusta.</p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>Spółki obserwowane przechowywane są lokalnie.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Aktywo</th>
                  <th className="right">Cena dodania</th>
                  <th className="right">Kurs</th>
                  <th className="right">Dzień</th>
                  <th>Notatka</th>
                  <th className="right">Alerty</th>
                </tr>
              </thead>
              <tbody>
                {watchItems.map(w => {
                  const live = livePrices[w.symbol];
                  return (
                    <tr key={w.id ?? w.symbol} onClick={() => openChart(w.symbol)}>
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
                              title="Kliknij aby usunąć">
                              {a.type === 'above' ? '↑' : '↓'} {a.targetPrice?.toFixed(2)}
                            </button>
                          ))}
                          <button onClick={() => setAlertTarget(w)} className="chip chip-info" style={{ cursor: 'pointer', border: 'none' }}>+ Alert</button>
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
        <Card title="Posiadane spółki">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="right">Ilość</th>
                  <th className="right">Śr. cena</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map(pos => (
                  <tr key={pos.id ?? pos.symbol} onClick={() => openChart(pos.symbol)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <TickerLogo symbol={pos.symbol} />
                        <div>
                          <div className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{pos.symbol}</div>
                          {pos.name && pos.name !== pos.symbol && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{pos.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="right mono" style={{ fontSize: 13 }}>{pos.qty?.toLocaleString('pl-PL') ?? '—'}</td>
                    <td className="right mono" style={{ fontSize: 13, color: 'var(--text-dim)' }}>{pos.avgPrice?.toFixed(2)} {pos.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {alertTarget && (
        <AlertModal item={alertTarget} onClose={() => setAlertTarget(null)} onSave={alert => addAlert(alertTarget.id, alert)} />
      )}
    </div>
  );
}
