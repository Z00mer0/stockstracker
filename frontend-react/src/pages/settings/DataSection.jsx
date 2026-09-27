import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Upload, FileText, Undo2, Pencil, Trash2, Plus, Save, X, Link2, Copy, Check, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import { api } from '../../hooks/useApi';
import ConfirmModal from '../../components/ConfirmModal';
import { Badge, Button, Callout, Card, Field, IconButton, Input, Select, Table } from '../../components/ui';
import { Note } from './common.jsx';

// Oba okna ciągną ciężkie parsery (xlsx, pdfjs, tesseract) — ładowane dopiero po otwarciu.
const BrokerImportModal = lazy(() => import('../../components/BrokerImportModal'));
const SnapshotImportModal = lazy(() => import('../../components/SnapshotImportModal'));

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function BrokerImportCard() {
  const t = useT();
  const { locale } = useLanguage();
  const { transactions, portfolio, cash, importBrokerTransactions, clearBrokerImport, canWrite } = useApp();
  const [showBroker, setShowBroker] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [clearingId, setClearingId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const batches = useMemo(() => {
    const byId = {};
    for (const tx of transactions) {
      if (!tx.importId) continue;
      if (!byId[tx.importId]) byId[tx.importId] = { importId: tx.importId, count: 0, note: tx.note || '' };
      byId[tx.importId].count++;
    }
    return Object.values(byId)
      .sort((a, b) => b.importId.localeCompare(a.importId))
      .map(b => {
        const ts = parseInt(b.importId.replace('imp_', ''));
        const dateStr = isNaN(ts) ? '' : new Date(ts).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const isStatement = String(b.note).startsWith('Snapshot');
        return { ...b, isStatement, when: isStatement ? b.note.replace('Snapshot ', '') : dateStr };
      });
  }, [transactions, locale]);

  async function doClear(importId) {
    setConfirm(null);
    setClearingId(importId || 'legacy');
    try { await clearBrokerImport(importId); } finally { setClearingId(null); }
  }

  return (
    <Card title={t('broker_import')}>
      <div className="grid gap-3 p-4">
        <p className="text-small text-dim">{t('import_csv')}</p>
        {!canWrite && <Callout tone="info" icon={Info}>{t('settings_pick_portfolio')}</Callout>}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={Upload} disabled={!canWrite} onClick={() => setShowBroker(true)}>{t('import_csv_btn').replace(/^↑\s*/, '')}</Button>
          <Button icon={FileText} disabled={!canWrite} onClick={() => setShowStatement(true)}>{t('import_statement_btn')}</Button>
        </div>
        {batches.length > 0 && (
          <div className="grid gap-1.5">
            <p className="text-label font-semibold uppercase text-faint">{t('import_history')}</p>
            {batches.map(b => (
              <div key={b.importId} className="flex items-center justify-between gap-2 rounded-card-sm bg-panel-2 px-3 py-2">
                <span className="flex min-w-0 flex-wrap items-center gap-2 text-small text-dim">
                  <Badge tone={b.isStatement ? 'info' : 'neutral'}>{b.isStatement ? t('import_kind_statement') : 'CSV'}</Badge>
                  {b.when}
                  <span className="text-[11px] text-faint">{b.count} {t('transactions_short')}</span>
                </span>
                <Button size="sm" variant="ghost" icon={Undo2} disabled={!canWrite} loading={clearingId === (b.importId || 'legacy')} onClick={() => setConfirm(b)} className="text-down">
                  {t('undo')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <Suspense fallback={null}>
        {showBroker && (
          <BrokerImportModal
            existingTransactions={transactions}
            existingPortfolio={portfolio}
            existingCash={cash}
            onSave={async newTxs => { await importBrokerTransactions(newTxs); }}
            onClose={() => setShowBroker(false)}
          />
        )}
        {showStatement && (
          <SnapshotImportModal
            onSave={async newTxs => { await importBrokerTransactions(newTxs); }}
            onClose={() => setShowStatement(false)}
          />
        )}
      </Suspense>
      {confirm && (
        <ConfirmModal
          danger
          message={`${t('delete')} ${confirm.count} ${t('delete_import_confirm')}`}
          onConfirm={() => doClear(confirm.importId)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </Card>
  );
}

// Ręczne snapshoty. Kwoty wpisuje się w walucie wyświetlania; do PLN
// przeliczamy kursem Z DNIA snapshotu (jego własnym `fx`), a nie dzisiejszym —
// wcześniej edycja starego wpisu nadpisywała jego kursy dzisiejszymi, więc
// Historia przeliczała go potem inaczej niż sąsiednie dni.
function SnapshotManagerCard() {
  const t = useT();
  const { locale } = useLanguage();
  const { snapshots, setSnapshot, deleteSnapshot, displayCurrency, fxRates, canWrite } = useApp();
  const currSymbol = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' }[displayCurrency] || displayCurrency;
  const today = new Date().toISOString().slice(0, 10);
  const empty = { date: today, total: '', invested: '' };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);   // snapshot w edycji
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [confirmDate, setConfirmDate] = useState(null);

  const rateOf = s => {
    const r = s?.fx?.[displayCurrency];
    return r > 0 ? r : (fxRates[displayCurrency] ?? 1);
  };
  const rows = useMemo(() => [...snapshots].sort((a, b) => b.date.localeCompare(a.date)), [snapshots]);
  const money = (v, s) => (v == null ? '—' : `${(v / rateOf(s)).toLocaleString(locale, { maximumFractionDigits: 0 })} ${currSymbol}`);

  function startEdit(s) {
    const toDisp = v => (v == null ? '' : String(Math.round((v / rateOf(s)) * 100) / 100));
    setEditing(s);
    setError('');
    setForm({ date: s.date, total: toDisp(s.total), invested: toDisp(s.invested) });
  }
  function cancelEdit() { setEditing(null); setForm(empty); setError(''); }

  async function handleSave() {
    const total = parseFloat(form.total);
    const inv = parseFloat(form.invested);
    if (!form.date || isNaN(total) || total < 0) return;
    // Istniejący wpis zachowuje swoje kursy; nowy dostaje dzisiejsze.
    const fx = editing?.fx ?? rows.find(s => s.date === form.date)?.fx ?? { ...fxRates };
    const rate = fx[displayCurrency] > 0 ? fx[displayCurrency] : (fxRates[displayCurrency] ?? 1);
    setSaving(true); setError('');
    try {
      await setSnapshot(form.date, total * rate, isNaN(inv) ? undefined : inv * rate, fx);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditing(null);
      setForm(empty);
    } catch (e) {
      setError(e.message || t('save_error'));
    } finally { setSaving(false); }
  }

  return (
    <Card title={t('portfolio_snapshots')}>
      <div className="grid gap-3 p-4">
        {!canWrite && <Callout tone="info" icon={Info}>{t('settings_pick_portfolio')}</Callout>}
        <p className="text-small text-dim">{editing ? `${t('editing_snapshot')} ${fmtDate(editing.date)}` : t('add_new_snapshot')}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('col_date')}>
            <Input type="date" value={form.date} disabled={!!editing} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </Field>
          <Field label={t('portfolio_val_zl').replace('zł', currSymbol)}>
            <Input type="number" min="0" step="any" inputMode="decimal" placeholder={t('pf_eg').replace('{v}', '35000')} value={form.total} onChange={e => setForm(f => ({ ...f, total: e.target.value }))} />
          </Field>
          <Field label={t('invested_zl').replace('zł', currSymbol)}>
            <Input type="number" min="0" step="any" inputMode="decimal" placeholder={t('pf_eg').replace('{v}', '20000')} value={form.invested} onChange={e => setForm(f => ({ ...f, invested: e.target.value }))} />
          </Field>
        </div>
        <Note tone="err">{error}</Note>
        <div className="flex gap-2">
          <Button variant="primary" icon={editing ? Save : Plus} loading={saving} disabled={!canWrite || !form.date || form.total === ''} onClick={handleSave}>
            {saved ? t('saved_ok') : editing ? t('save_changes') : t('add_snapshot')}
          </Button>
          {editing && <Button variant="ghost" icon={X} onClick={cancelEdit}>{t('cancel_btn')}</Button>}
        </div>
      </div>
      {rows.length > 0 && (
        <>
          <p className="border-t border-line px-4 pb-1 pt-3 text-label font-semibold uppercase text-faint">{t('existing_snapshots')} ({rows.length})</p>
          <Table
            columns={[
              { key: 'date', header: t('col_date'), mobile: 'title', render: s => <span className={editing?.date === s.date ? 'font-semibold text-accent-text' : 'text-dim'}>{fmtDate(s.date)}</span> },
              { key: 'total', header: t('col_value'), align: 'right', mobile: 'aside', render: s => <span className="font-medium text-fg">{money(s.total, s)}</span> },
              { key: 'invested', header: t('invested_label'), align: 'right', render: s => <span className="text-faint">{money(s.invested, s)}</span> },
              {
                key: 'actions', header: '', align: 'right',
                render: s => (
                  <span className="inline-flex gap-1">
                    <IconButton size="sm" icon={Pencil} label={`${t('edit')} ${fmtDate(s.date)}`} disabled={!canWrite} onClick={() => startEdit(s)} />
                    <IconButton size="sm" icon={Trash2} label={`${t('delete_btn')} ${fmtDate(s.date)}`} disabled={!canWrite} onClick={() => setConfirmDate(s.date)} className="hover:text-down" />
                  </span>
                ),
              },
            ]}
            rows={rows}
            rowKey={s => s.date}
            pageSize={20}
          />
        </>
      )}
      {confirmDate && (
        <ConfirmModal
          danger
          message={`${t('delete_snapshot_confirm')} ${fmtDate(confirmDate)}?`}
          onConfirm={() => { deleteSnapshot(confirmDate).catch(e => setError(e.message)); setConfirmDate(null); }}
          onCancel={() => setConfirmDate(null)}
        />
      )}
    </Card>
  );
}

function ShareLinkCard() {
  const t = useT();
  const { portfolios } = useApp();
  const [pid, setPid] = useState('');
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const selected = pid || portfolios[0]?.id || '';
  const shareUrl = token ? `${window.location.origin}/s/${token}` : null;

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setToken(null);
    api.get(`/api/share?portfolio_id=${encodeURIComponent(selected)}`)
      .then(res => { if (!cancelled) setToken(res.data.token); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selected]);

  async function generate() {
    setBusy(true);
    try { setToken((await api.post('/api/share', { portfolio_id: selected })).data.token); } catch { /* bez zmian */ } finally { setBusy(false); }
  }
  async function revoke() {
    setBusy(true);
    try { await api.post('/api/share/revoke', { portfolio_id: selected }); setToken(null); } catch { /* bez zmian */ } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* schowek niedostępny */ }
  }

  if (!portfolios.length) return null;
  return (
    <Card title={t('share_title')}>
      <div className="grid gap-3 p-4">
        <p className="text-small leading-relaxed text-dim">{t('share_desc')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label={t('share_title')} className="min-w-44" value={selected} onChange={e => setPid(e.target.value)}>
            {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          {token
            ? <Button variant="danger" disabled={busy} onClick={revoke}>{t('share_revoke')}</Button>
            : <Button variant="primary" icon={Link2} disabled={busy || !selected} onClick={generate}>{t('share_generate')}</Button>}
        </div>
        {shareUrl && (
          <div className="flex flex-wrap items-center gap-2 rounded-card-sm bg-panel-2 px-3 py-2.5">
            <a href={shareUrl} target="_blank" rel="noreferrer" className="min-w-[200px] flex-1 break-all font-mono text-small text-accent-text">{shareUrl}</a>
            <Button size="sm" icon={copied ? Check : Copy} onClick={copy}>{copied ? t('rc_copied') : t('share_copy')}</Button>
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-faint">{t('share_note')}</p>
      </div>
    </Card>
  );
}

export default function DataSection() {
  return (
    <div className="space-y-4">
      <BrokerImportCard />
      <SnapshotManagerCard />
      <ShareLinkCard />
    </div>
  );
}
