// src/pages/Alerts.jsx
import { useEffect, useMemo, useState } from 'react';
import { BellOff, Plus, Trash2, WifiOff } from 'lucide-react';
import { isAuthed } from '../utils/auth.js';
import TickerLogo from '../components/shared/TickerLogo';
import { PageSkeleton } from '../components/RouteFallback';
import { useT } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Select, Table } from '../components/ui';
import { useApp } from '../context/AppContext';
import { addAlertToItems, apiLoadWatchlist, apiSaveWatchlist, collectAllAlerts, genAlertId, removeAlertFromItems } from '../services/watchlistService';

function condition(a, t) {
  if (a.kind === 'dailyChange') return `${a.type === 'above' ? '↑' : '↓'} ${a.targetPercent}% ${t('alerts_today')}`;
  if (a.kind === 'fromCost') return `${a.type === 'above' ? '↑ +' : '↓ −'}${a.targetPercent}% ${t('alerts_from_cost')}`;
  if (a.kind === 'week52') return a.type === 'above' ? `52W ↑ (${t('alert_new_high')})` : `52W ↓ (${t('alert_new_low')})`;
  return `${a.type === 'above' ? `↑ ${t('alerts_above')}` : `↓ ${t('alerts_below')}`} ${a.targetPrice?.toFixed(2)}`;
}

// Alert kursu walut: para jako symbol Yahoo (USDPLN=X) na liście obserwowanych —
// serwer sprawdza go jak każdy alert cenowy.
const FX_PAIRS = ['USD', 'EUR', 'GBP', 'CHF'];

function FxAlertCard({ items, onSave }) {
  const t = useT();
  const { fxRates } = useApp();
  const [ccy, setCcy] = useState('USD');
  const [type, setType] = useState('above');
  const [level, setLevel] = useState('');
  const now = fxRates?.[ccy];
  const target = parseFloat(String(level).replace(',', '.'));

  async function add() {
    if (!(target > 0)) return;
    const symbol = `${ccy}PLN=X`;
    const next = addAlertToItems(items, symbol, { id: genAlertId(), kind: 'price', type, targetPrice: target, mode: 'once', triggered: false })
      .map(w => (w.symbol === symbol ? { ...w, name: `${ccy}/PLN`, currency: 'PLN' } : w));
    if (await onSave(next, items)) setLevel('');
  }

  return (
    <Card title={t('fx_alert_title')}>
      <form className="flex flex-wrap items-end gap-2 px-4 pb-4 pt-2" onSubmit={e => { e.preventDefault(); add(); }}>
        <Field label={t('fx_alert_pair')}>
          <Select value={ccy} onChange={e => setCcy(e.target.value)}>
            {FX_PAIRS.map(c => <option key={c} value={c}>{c}/PLN</option>)}
          </Select>
        </Field>
        <Field label={t('alerts_condition')}>
          <Select value={type} onChange={e => setType(e.target.value)}>
            <option value="above">{t('alerts_above')}</option>
            <option value="below">{t('alerts_below')}</option>
          </Select>
        </Field>
        <Field label={t('fx_alert_level')} hint={now ? t('fx_alert_now').replace('{rate}', now.toFixed(4)) : undefined}>
          <Input type="text" inputMode="decimal" suffix="zł" value={level} onChange={e => setLevel(e.target.value)} placeholder={now ? now.toFixed(2) : '4.00'} />
        </Field>
        <Button type="submit" variant="primary" icon={Plus} disabled={!(target > 0)}>{t('add')}</Button>
      </form>
    </Card>
  );
}

export default function Alerts() {
  const t = useT();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuthed()) { setLoading(false); return; }
    apiLoadWatchlist()
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message || t('alerts_load_error')))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Uzbrojone najpierw, potem wystrzelone.
  const alerts = useMemo(() => {
    const all = collectAllAlerts(items);
    return [...all.filter(a => !a.triggered), ...all.filter(a => a.triggered)];
  }, [items]);

  async function save(next, prev) {
    setItems(next);
    try { await apiSaveWatchlist(next); return true; } catch {
      // Wcześniej alert znikał z listy, choć zapis się nie udał.
      setItems(prev);
      showToast(t('alerts_save_error'), { type: 'error' });
      return false;
    }
  }

  async function handleRemove(a) {
    const prev = items;
    if (await save(removeAlertFromItems(items, a.itemId, a.id), prev)) {
      showToast(t('alerts_removed').replace('{sym}', a.symbol), {
        type: 'success',
        action: { label: t('undo'), onClick: () => save(prev, prev) },
      });
    }
  }

  if (loading) return <PageSkeleton />;
  if (error) return <EmptyState icon={WifiOff} title={error} className="py-16" />;

  const kind = a => t(`alert_kind_${a.kind === 'week52' ? 'week52' : a.kind === 'dailyChange' ? 'daily' : a.kind === 'fromCost' ? 'cost' : 'price'}`);
  return (
    <div className="space-y-4">
      <FxAlertCard items={items} onSave={save} />
      <Card title={`${t('nav_alerts')} · ${alerts.length}`}>
        <Table
          columns={[
            { key: 'symbol', header: t('col_symbol'), mobile: 'title', render: a => <span className="flex items-center gap-2"><TickerLogo symbol={a.symbol} /><span className="font-semibold text-fg">{a.symbol}</span></span> },
            { key: 'kind', header: t('col_type'), render: a => <span className="text-dim">{kind(a)}</span> },
            { key: 'cond', header: t('alerts_condition'), render: a => <span className="font-medium text-fg">{condition(a, t)}</span> },
            { key: 'mode', header: t('alerts_mode'), render: a => <span className="text-faint">{t(`alert_mode_${a.mode || 'once'}`)}</span> },
            { key: 'status', header: t('alerts_status'), mobile: 'aside', render: a => (a.triggered ? <Badge tone="warn">{t('alerts_triggered')}</Badge> : <Badge tone="up">{t('alerts_armed')}</Badge>) },
            { key: 'x', header: '', align: 'right', render: a => <IconButton size="sm" icon={Trash2} label={`${t('delete_btn')} — ${a.symbol}`} onClick={() => handleRemove(a)} className="hover:text-down" /> },
          ]}
          rows={alerts}
          rowKey={a => a.id}
          empty={<EmptyState icon={BellOff} title={t('alerts_empty_title')} description={t('alerts_empty_hint')} />}
        />
        <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-faint">{t('alerts_footer')}</p>
      </Card>
    </div>
  );
}
