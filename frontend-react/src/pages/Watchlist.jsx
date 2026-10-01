// src/pages/Watchlist.jsx
import { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { isAuthed } from '../utils/auth.js';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useToast } from '../context/ToastContext';
import StockDetailModal from '../components/StockDetailModal';
import Chip from '../components/shared/Chip';
import TickerLogo from '../components/shared/TickerLogo';
import PushToggle from '../components/PushToggle';
import AlertModal from '../components/AlertModal';
import { Button, Card, EmptyState, IconButton, Input, Spinner, Table } from '../components/ui';
import { cx } from '../components/ui/cx.js';
import {
  apiLoadWatchlist, apiSaveWatchlist, loadWatchlistLocal, saveWatchlistLocal,
  addAlertToItems, removeAlertFromItems,
} from '../services/watchlistService';

async function fetchLivePrice(sym) {
  try {
    const q = await fetch(`/api/finnhub/v1/quote?symbol=${sym}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
    if (q?.c > 0) return { price: q.c, dailyChg: q.dp ?? null };
  } catch { /* dalej Yahoo */ }
  try {
    const yfUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
    const json = await fetch(`/api/proxy?url=${encodeURIComponent(yfUrl)}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
    const meta = json?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice) {
      const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
      return { price: meta.regularMarketPrice, dailyChg: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : null };
    }
  } catch { /* brak ceny */ }
  return null;
}

const genId = () => Math.random().toString(36).slice(2, 10);

function alertLabel(a, t) {
  const base = a.kind === 'dailyChange'
    ? `${a.type === 'above' ? '↑' : '↓'}${a.targetPercent}% ${t('alerts_today')}`
    : a.kind === 'week52' ? `52W ${a.type === 'above' ? '↑' : '↓'}` : `${a.type === 'above' ? '↑' : '↓'} ${a.targetPrice?.toFixed(2)}`;
  return base + (a.mode === 'rearm' ? ' ↻' : a.mode === 'repeat' ? ' ⟳' : '');
}

export default function Watchlist() {
  const { portfolio, watchlistMigrationPending } = useApp();
  const { locale } = useLanguage();
  const t = useT();
  const { isPrivate } = usePrivacy();
  const { showToast } = useToast();
  const [watchItems, setWatchItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [alertTarget, setAlertTarget] = useState(null);
  const [livePrices, setLivePrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [inputTicker, setInputTicker] = useState('');
  const [adding, setAdding] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const sugRef = useRef(null);
  const justPicked = useRef(false);

  useEffect(() => {
    if (justPicked.current) { justPicked.current = false; return; }
    if (inputTicker.trim().length < 2) { setSuggestions([]); setShowSug(false); return; }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(inputTicker.trim())}`);
        if (!res.ok) return;
        const { results } = await res.json();
        setSuggestions(results ?? []);
        setShowSug((results ?? []).length > 0);
      } catch { /* bez podpowiedzi */ }
    }, 300);
    return () => clearTimeout(id);
  }, [inputTicker]);

  useEffect(() => {
    const onDown = e => { if (sugRef.current && !sugRef.current.contains(e.target)) setShowSug(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (isAuthed()) {
      apiLoadWatchlist()
        .then(data => setWatchItems(Array.isArray(data) ? data : loadWatchlistLocal()))
        .catch(() => setWatchItems(loadWatchlistLocal()))
        .finally(() => setInitialized(true));
    } else {
      setWatchItems(loadWatchlistLocal());
      setInitialized(true);
    }
  }, []);

  // Po dokończeniu migracji z localStorage przeładuj z serwera — inaczej
  // pierwszy zapis nadpisałby zmigrowane alerty stanem sprzed migracji.
  useEffect(() => {
    if (watchlistMigrationPending || !initialized || !isAuthed()) return;
    apiLoadWatchlist().then(data => { if (Array.isArray(data)) setWatchItems(data); }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistMigrationPending]);

  useEffect(() => {
    if (!initialized || watchlistMigrationPending) return;
    saveWatchlistLocal(watchItems);
    if (isAuthed()) apiSaveWatchlist(watchItems).catch(() => showToast(t('alerts_save_error_generic'), { type: 'error' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchItems, initialized, watchlistMigrationPending]);

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
    setShowSug(false);
    const existing = watchItems.find(w => w.symbol === sym);
    if (existing) { setInputTicker(''); setAlertTarget(existing); return; }
    setAdding(true);
    const id = genId();
    setWatchItems(prev => [...prev, { id, symbol: sym, name: sym, alerts: [] }]);
    setInputTicker('');
    const live = await fetchLivePrice(sym);
    if (live) {
      setLivePrices(prev => ({ ...prev, [sym]: live }));
      // Kolumna „Cena dodania" była zawsze pusta — cena z chwili dodania
      // była pobierana, ale nigdzie nie zapisywana.
      setWatchItems(prev => prev.map(w => (w.id === id ? { ...w, addedPrice: live.price } : w)));
    }
    setAdding(false);
  }

  function pickSuggestion(s) {
    justPicked.current = true;
    setInputTicker(s.symbol);
    setSuggestions([]);
    setShowSug(false);
  }

  // Usunięcie jednym kliknięciem bez potwierdzenia — więc z „Cofnij".
  function withUndo(next, message) {
    const prev = watchItems;
    setWatchItems(next);
    showToast(message, { type: 'success', action: { label: t('undo'), onClick: () => setWatchItems(prev) } });
  }

  const columns = [
    {
      key: 'symbol', header: t('col_symbol'), mobile: 'title',
      render: w => (
        <span className="flex min-w-0 items-center gap-2">
          <TickerLogo symbol={w.symbol} />
          <span className="min-w-0">
            <span className="block font-semibold text-fg">{w.symbol}</span>
            {w.name && w.name !== w.symbol && <span className="block truncate text-[11px] text-faint">{w.name}</span>}
          </span>
        </span>
      ),
    },
    { key: 'addedPrice', header: t('col_added_price'), align: 'right', render: w => <span className="text-dim">{w.addedPrice != null ? `${w.addedPrice.toFixed(2)} ${w.currency ?? ''}` : '—'}</span> },
    {
      key: 'price', header: t('col_price'), align: 'right', mobile: 'aside',
      render: w => {
        const live = livePrices[w.symbol];
        return loading && !live ? <span className="text-faint">…</span> : live ? <span className="font-semibold">{live.price.toFixed(2)} {w.currency ?? ''}</span> : <span className="text-faint">—</span>;
      },
    },
    { key: 'day', header: t('col_day'), align: 'right', render: w => (livePrices[w.symbol]?.dailyChg != null ? <Chip value={livePrices[w.symbol].dailyChg} /> : <span className="text-faint">—</span>) },
    { key: 'note', header: t('col_note'), render: w => <span className="text-faint">{w.note || '—'}</span> },
    {
      key: 'alerts', header: t('nav_alerts'), align: 'right',
      render: w => (
        <span className="inline-flex flex-wrap items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
          {(w.alerts ?? []).map(a => (
            <button
              key={a.id} type="button"
              onClick={() => withUndo(removeAlertFromItems(watchItems, w.id, a.id), t('alerts_removed').replace('{sym}', w.symbol))}
              title={`${t(`alert_mode_${a.mode || 'once'}_hint`)} — ${t('click_to_remove')}`}
              className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', a.triggered ? 'bg-warn-soft text-warn line-through' : a.type === 'above' ? 'bg-up-soft text-up' : 'bg-down-soft text-down')}
            >
              {alertLabel(a, t)}
            </button>
          ))}
          <IconButton size="sm" icon={(w.alerts ?? []).length ? BellRing : Bell} label={`${t('watch_set_alert')} — ${w.symbol}`} onClick={() => setAlertTarget(w)} className={(w.alerts ?? []).length ? 'text-warn' : undefined} />
          <IconButton size="sm" icon={Trash2} label={`${t('watch_remove')} — ${w.symbol}`} onClick={() => withUndo(watchItems.filter(x => x.id !== w.id), t('watch_removed').replace('{sym}', w.symbol))} className="hover:text-down" />
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card
        title={`${t('watched_companies')}${watchItems.length ? ` · ${watchItems.length}` : ''}`}
        actions={<div className="flex items-center gap-2">{loading && <Spinner size="sm" label={t('loading_quotes')} />}<PushToggle /></div>}
      >
        <div className="flex gap-2 px-4 pt-3">
          <div ref={sugRef} className="relative w-full max-w-60">
            <Input
              icon={Search}
              aria-label={t('col_symbol')}
              placeholder={t('pf_eg').replace('{v}', 'AAPL, PKN.WA')}
              value={inputTicker}
              onChange={e => { setInputTicker(e.target.value); setShowSug(true); }}
              onFocus={() => suggestions.length > 0 && setShowSug(true)}
              onKeyDown={e => e.key === 'Enter' && addWatchItem()}
              autoComplete="off"
            />
            {showSug && suggestions.length > 0 && (
              <ul className="ui-menu absolute inset-x-0 top-full z-[200] mt-1 max-h-64 overflow-y-auto rounded-card-sm border border-line bg-panel py-1 shadow-pop">
                {suggestions.map(s => (
                  <li key={s.symbol}>
                    <button type="button" onMouseDown={() => pickSuggestion(s)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-panel-hover">
                      <span className="min-w-[72px] text-small font-bold text-accent-text">{s.symbol}</span>
                      <span className="flex-1 truncate text-small text-dim">{s.name}</span>
                      {s.exchange && <span className="shrink-0 text-[10px] text-faint">{s.exchange}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button variant="primary" icon={Plus} loading={adding} disabled={!inputTicker.trim()} onClick={addWatchItem}>{t('add')}</Button>
        </div>
        <Table
          columns={columns}
          rows={watchItems}
          rowKey={w => w.id ?? w.symbol}
          onRowClick={w => setSelectedItem({ symbol: w.symbol, name: w.name })}
          empty={<EmptyState icon={Eye} title={t('watch_empty_title')} description={t('watched_synced')} />}
        />
      </Card>

      {portfolio.length > 0 && (
        <Card title={t('owned_companies')}>
          <Table
            columns={[
              { key: 'symbol', header: t('col_symbol'), mobile: 'title', render: p => <span className="flex items-center gap-2"><TickerLogo symbol={p.symbol} /><span className="font-semibold text-fg">{p.symbol}</span></span> },
              { key: 'qty', header: t('col_qty'), align: 'right', render: p => <span className={isPrivate ? 'privacy-blur' : undefined}>{p.qty?.toLocaleString(locale) ?? '—'}</span> },
              { key: 'avgPrice', header: t('col_avg_price_short'), align: 'right', mobile: 'aside', render: p => <span className={cx('text-dim', isPrivate && 'privacy-blur')}>{p.avgPrice?.toFixed(2)} {p.currency}</span> },
            ]}
            rows={portfolio}
            rowKey={p => p.id ?? p.symbol}
            onRowClick={setSelectedItem}
          />
        </Card>
      )}

      {alertTarget && (
        <AlertModal
          symbol={alertTarget.symbol}
          currency={alertTarget.currency}
          livePrice={livePrices[alertTarget.symbol]}
          fallbackPrice={alertTarget.addedPrice}
          onClose={() => setAlertTarget(null)}
          onSave={alert => { setWatchItems(prev => addAlertToItems(prev, alertTarget.symbol, alert)); setAlertTarget(null); }}
        />
      )}
      {selectedItem && (
        <StockDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
