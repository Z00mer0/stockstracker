import { parseLabels } from '../../utils/labels.js';
import { useRef, useState } from 'react';
import { RefreshCw, LogOut, KeyRound, Download, Upload, Copy, Check, ShieldCheck, Trash2, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import { api } from '../../hooks/useApi';
import { Button, Card, Field, Input, Modal, SegmentedControl } from '../../components/ui';
import { Row, Note, download } from './common.jsx';
import ConfirmModal from '../../components/ConfirmModal';
import { buildBackup, parseBackup } from '../../utils/backup.js';

function AccountCard() {
  const t = useT();
  const { displayName, logout, refresh } = useApp();
  const { language, setLanguage } = useLanguage();
  const apiUrl = import.meta.env.VITE_API_URL ?? t('api_url_local');
  return (
    <Card title={t('account')}>
      <div className="px-4 pb-4">
        <Row label={t('logged_in_as')} value={displayName || '—'} />
        <Row label={t('language_section')}>
          <SegmentedControl
            options={[{ value: 'pl', label: 'Polski' }, { value: 'en', label: 'English' }]}
            value={language}
            onChange={setLanguage}
          />
        </Row>
        <Row label="API URL"><span className="max-w-[300px] truncate font-mono text-[11px] text-faint">{apiUrl}</span></Row>
        <div className="flex flex-wrap gap-2 pt-4">
          <Button variant="primary" size="sm" icon={RefreshCw} onClick={refresh}>{t('refresh_data')}</Button>
          <Button size="sm" icon={LogOut} onClick={logout}>{t('logout').replace(/\s*→$/, '')}</Button>
        </div>
      </div>
    </Card>
  );
}

function ChangePasswordCard() {
  const t = useT();
  const [form, setForm] = useState({ current: '', next: '', next2: '' });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const incomplete = !form.current || !form.next || !form.next2;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null); setSuccess(false);
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
      <form onSubmit={handleSubmit} className="grid gap-3 p-4 sm:max-w-sm">
        {[[t('current_password'), 'current', 'current-password'], [t('new_password'), 'next', 'new-password'], [t('repeat_new_password'), 'next2', 'new-password']].map(([label, field, ac]) => (
          <Field key={field} label={label}>
            <Input type="password" autoComplete={ac} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
          </Field>
        ))}
        <Note tone="err">{error}</Note>
        <Note tone="ok">{success && t('password_changed')}</Note>
        <Button type="submit" variant="primary" icon={KeyRound} loading={loading} disabled={incomplete} className="justify-self-start">
          {t('change_password_btn')}
        </Button>
      </form>
    </Card>
  );
}

function RecoveryCodesCard() {
  const t = useT();
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setError(null); setLoading(true);
    try {
      const res = await api.post('/api/recovery-codes');
      setCodes(res.data.codes);
    } catch {
      setError(t('rc_error'));
    } finally { setLoading(false); }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* schowek niedostępny */ }
  }

  return (
    <Card title={t('rc_title')}>
      <div className="grid gap-3 p-4">
        <p className="text-small text-dim">{t('rc_sub')}</p>
        <p className="text-small text-warn">{t('rc_regen_warn')}</p>
        {codes && (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
              {codes.map(c => (
                <span key={c} className="select-all rounded-card-sm border border-line bg-panel-2 px-1.5 py-2 text-center font-mono text-[13px] text-fg">{c}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" icon={Download} onClick={() => download(new Blob([`myfund — ${t('rc_title')}\n\n${codes.join('\n')}\n`], { type: 'text/plain' }), 'myfund-recovery-codes.txt')}>{t('rc_download')}</Button>
              <Button size="sm" icon={copied ? Check : Copy} onClick={copy}>{copied ? t('rc_copied') : t('rc_copy')}</Button>
            </div>
          </>
        )}
        <Note tone="err">{error}</Note>
        <Button variant="primary" icon={ShieldCheck} loading={loading} onClick={generate} className="justify-self-start">{t('rc_generate')}</Button>
      </div>
    </Card>
  );
}

function ExportDataCard() {
  const t = useT();
  const { restorePortfolios } = useApp();
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pending, setPending] = useState(null);
  const fileRef = useRef(null);

  // Każdy portfel osobno (utils/backup.js) — widok „Wszystkie" miał już
  // zsumowane pozycje i gotówkę, więc z niego nie dało się nic odtworzyć.
  async function exportAll() {
    setError(null); setInfo(null); setLoading(true);
    try {
      const list = (await api.get('/api/portfolios')).data;
      const datas = await Promise.all(list.map(p => api.get(`/api/portfolios/${p.id}/data`).then(r => r.data)));
      const payload = buildBackup(list, Object.fromEntries(list.map((p, i) => [p.id, datas[i]])));
      download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `myfund-export-${new Date().toISOString().slice(0, 10)}.json`);
    } catch {
      setError(t('export_error'));
    } finally { setLoading(false); }
  }

  function readFile(file) {
    if (!file) return;
    setError(null); setInfo(null);
    file.text()
      .then(text => setPending(parseBackup(JSON.parse(text), t('restore_combined_name'))))
      .catch(() => setError(t('restore_bad_file')))
      .finally(() => { if (fileRef.current) fileRef.current.value = ''; });
  }

  async function restore() {
    const entries = pending;
    setPending(null); setRestoring(true);
    try {
      const n = await restorePortfolios(entries);
      setInfo(t('restore_done').replace('{n}', n));
    } catch (e) {
      setError(`${t('restore_error')} ${e.message ?? ''}`.trim());
    } finally { setRestoring(false); }
  }

  return (
    <Card title={t('export_title')}>
      <div className="grid gap-3 p-4">
        <p className="text-small text-dim">{t('export_desc')}</p>
        <p className="text-small text-dim">{t('restore_desc')}</p>
        <Note tone="err">{error}</Note>
        {info && <p role="status" className="text-small text-up">{info}</p>}
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={e => readFile(e.target.files[0])} />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={Download} loading={loading} onClick={exportAll}>{t('export_btn')}</Button>
          <Button icon={Upload} loading={restoring} onClick={() => fileRef.current?.click()}>{t('restore_btn')}</Button>
        </div>
      </div>
      {pending && (
        <ConfirmModal
          danger={false}
          message={t('restore_confirm').replace('{n}', pending.length)}
          detail={`${pending.map(p => p.name).join(', ')}. ${t('restore_confirm_detail')}`}
          confirmLabel={t('restore_btn')}
          onConfirm={restore}
          onCancel={() => setPending(null)}
        />
      )}
    </Card>
  );
}

// Usunięcie portfela razem z jego pozycjami, transakcjami i historią.
// Ostatniego portfela usunąć się nie da (serwer też tego pilnuje).
function PortfoliosCard() {
  const t = useT();
  const { portfolios, deletePortfolio, refresh } = useApp();
  const [target, setTarget] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const last = portfolios.length <= 1;

  async function remove() {
    const p = target;
    setTarget(null); setError(null); setBusy(p.id);
    try {
      await deletePortfolio(p.id);
      refresh();
    } catch (e) {
      setError(e.response?.data?.error ?? e.message);
    } finally { setBusy(null); }
  }

  return (
    <Card title={t('pfl_manage_title')}>
      <div className="grid gap-2 p-4">
        <Note tone="err">{error}</Note>
        {portfolios.map(p => (
          <div key={p.id} className="flex items-center gap-3 rounded-card-sm border border-line px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-fg">{p.name}</span>
            <span className="shrink-0 text-small text-faint">{[p.currency, p.accountType || p.account_type].filter(Boolean).join(' · ')}</span>
            <Button
              size="sm" variant="danger" icon={Trash2}
              loading={busy === p.id}
              disabled={last}
              title={last ? t('pfl_delete_last') : undefined}
              onClick={() => setTarget(p)}
            >
              {t('delete')}
            </Button>
          </div>
        ))}
        {last && <p className="text-small text-faint">{t('pfl_delete_last')}</p>}
      </div>
      {target && (
        <ConfirmModal
          message={t('pfl_delete_confirm').replace('{name}', target.name)}
          detail={t('pfl_delete_detail')}
          confirmLabel={t('pfl_delete_btn')}
          onConfirm={remove}
          onCancel={() => setTarget(null)}
        />
      )}
    </Card>
  );
}

// Grupy portfeli: własny widok z kilku portfeli (np. „Emerytura” = IKE +
// zwykły rachunek) — w przełączniku portfeli pod „Wszystkie”.
function GroupModal({ initial, portfolios, onSave, onClose }) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? '');
  const [ids, setIds] = useState(new Set(initial?.portfolioIds ?? []));
  const [labels, setLabels] = useState((initial?.labels ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const toggle = id => setIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function save() {
    if (!name.trim()) { setError(t('group_err_name')); return; }
    if (ids.size < 1) { setError(t('group_err_pick')); return; }
    setSaving(true);
    try {
      await onSave({ id: initial?.id ?? Math.random().toString(36).slice(2, 10), name: name.trim(), portfolioIds: portfolios.filter(p => ids.has(p.id)).map(p => p.id), labels: parseLabels(labels) });
      onClose();
    } catch (e) { setError(e.response?.data?.error ?? e.message); } finally { setSaving(false); }
  }
  return (
    <Modal size="sm" title={initial ? t('group_edit') : t('group_new')} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" loading={saving} onClick={save}>{t('save_btn')}</Button></>}>
      <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save(); }}>
        <Field label={t('group_name')}><Input value={name} onChange={e => setName(e.target.value)} placeholder={t('group_name_ph')} /></Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-label font-semibold uppercase text-dim">{t('group_portfolios')}</legend>
          {portfolios.map(p => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 text-[13px] text-fg">
              <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={ids.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="flex-1">{p.name}</span>
              <span className="text-small text-faint">{[p.currency, p.accountType || p.account_type].filter(Boolean).join(' · ')}</span>
            </label>
          ))}
        </fieldset>
        <Field label={t('group_labels')} hint={t('group_labels_hint')}>
          <Input value={labels} onChange={e => setLabels(e.target.value)} placeholder={t('lbl_ph')} />
        </Field>
        <Note tone="err">{error}</Note>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function GroupsCard() {
  const t = useT();
  const { portfolios, groups = [], saveGroups } = useApp();
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const upsert = g => saveGroups(groups.some(x => x.id === g.id) ? groups.map(x => (x.id === g.id ? g : x)) : [...groups, g]);
  if (portfolios.length < 2) return null;
  const nameOf = id => portfolios.find(p => p.id === id)?.name;
  return (
    <Card title={t('groups_title')} actions={<Button size="sm" icon={Plus} onClick={() => setEdit({})}>{t('group_new')}</Button>}>
      <div className="grid gap-2 p-4">
        <p className="text-small text-dim">{t('groups_desc')}</p>
        {groups.map(g => (
          <div key={g.id} className="flex items-center gap-3 rounded-card-sm border border-line px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-fg">{g.name}</span>
              <span className="block truncate text-small text-faint">{g.portfolioIds.map(nameOf).filter(Boolean).join(' + ')}{g.labels?.length ? ` · ${t('lbl_field').toLowerCase()}: ${g.labels.join(', ')}` : ''}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setEdit(g)}>{t('edit')}</Button>
            <Button size="sm" variant="danger" icon={Trash2} onClick={() => setDel(g)}>{t('delete')}</Button>
          </div>
        ))}
      </div>
      {edit && <GroupModal initial={edit.id ? edit : null} portfolios={portfolios} onSave={upsert} onClose={() => setEdit(null)} />}
      {del && <ConfirmModal message={t('group_delete_confirm').replace('{name}', del.name)} detail={t('group_delete_detail')} onConfirm={() => { const g = del; setDel(null); saveGroups(groups.filter(x => x.id !== g.id)); }} onCancel={() => setDel(null)} />}
    </Card>
  );
}

export default function AccountSection() {
  return (
    <div className="space-y-4">
      <AccountCard />
      <ChangePasswordCard />
      <RecoveryCodesCard />
      <ExportDataCard />
      <PortfoliosCard />
      <GroupsCard />
    </div>
  );
}
