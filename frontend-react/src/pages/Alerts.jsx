// src/pages/Alerts.jsx
import { useEffect, useMemo, useState } from 'react';
import { BellOff, Trash2, WifiOff } from 'lucide-react';
import { isAuthed } from '../utils/auth.js';
import TickerLogo from '../components/shared/TickerLogo';
import { PageSkeleton } from '../components/RouteFallback';
import { useT } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { Badge, Card, EmptyState, IconButton, Table } from '../components/ui';
import { apiLoadWatchlist, apiSaveWatchlist, collectAllAlerts, removeAlertFromItems } from '../services/watchlistService';

function condition(a, t) {
  if (a.kind === 'dailyChange') return `${a.type === 'above' ? '↑' : '↓'} ${a.targetPercent}% ${t('alerts_today')}`;
  if (a.kind === 'week52') return a.type === 'above' ? `52W ↑ (${t('alert_new_high')})` : `52W ↓ (${t('alert_new_low')})`;
  return `${a.type === 'above' ? `↑ ${t('alerts_above')}` : `↓ ${t('alerts_below')}`} ${a.targetPrice?.toFixed(2)}`;
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

  const kind = a => t(`alert_kind_${a.kind === 'week52' ? 'week52' : a.kind === 'dailyChange' ? 'daily' : 'price'}`);
  return (
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
  );
}
