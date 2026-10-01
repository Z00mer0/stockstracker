import { useState } from 'react';
import { RefreshCw, LogOut, KeyRound, Download, Copy, Check, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import { api } from '../../hooks/useApi';
import { Button, Card, Field, Input, SegmentedControl } from '../../components/ui';
import { Row, Note, download } from './common.jsx';

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
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function exportAll() {
    setError(null); setLoading(true);
    try {
      const [list, data] = await Promise.all([api.get('/api/portfolios'), api.get('/api/portfolios/all/data')]);
      const payload = { exported_at: new Date().toISOString(), app: 'MyFund / StocksTracker', portfolios: list.data, data: data.data };
      download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `myfund-export-${new Date().toISOString().slice(0, 10)}.json`);
    } catch {
      setError(t('export_error'));
    } finally { setLoading(false); }
  }

  return (
    <Card title={t('export_title')}>
      <div className="grid gap-3 p-4">
        <p className="text-small text-dim">{t('export_desc')}</p>
        <Note tone="err">{error}</Note>
        <Button variant="primary" icon={Download} loading={loading} onClick={exportAll} className="justify-self-start">{t('export_btn')}</Button>
      </div>
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
    </div>
  );
}
