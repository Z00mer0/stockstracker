import { useEffect, useState } from 'react';
import { Bell, BellRing, TriangleAlert } from 'lucide-react';
import { api } from '../../hooks/useApi';
import { useT } from '../../context/LanguageContext';
import NotificationCard from '../../components/NotificationCard';
import { useNotificationTone, useNotificationHour } from '../../hooks/useNotificationTone';
import { NOTIFY_THRESHOLD } from '../../utils/notificationText.js';
import { authHeader } from '../../utils/auth.js';
import { pushSupported, getPushSubscription, subscribePush } from '../../utils/pushSubscription.js';
import { Button, Callout, Card, SegmentedControl, Select } from '../../components/ui';
import { Row, Note } from './common.jsx';

// Logika bez zmian; wcześniej karta nie miała wewnętrznego odstępu
// (treść przyklejona do krawędzi).
function PortfolioAlertCard() {
  const t = useT();
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(10);
  const [usSummary, setUsSummary] = useState(false);
  const [gpwSummary, setGpwSummary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [hasSub, setHasSub] = useState(true); // true, dopóki nie sprawdzimy — bez fałszywego ostrzeżenia

  useEffect(() => {
    fetch('/api/portfolio-alert', { headers: authHeader() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setEnabled(d.enabled); setThreshold(d.thresholdPct); setUsSummary(!!d.usSummary); setGpwSummary(!!d.gpwSummary); } })
      .catch(() => {});
    getPushSubscription().then(sub => setHasSub(!!sub));
  }, []);

  const isEnabling = next => (next.enabled === true && !enabled)
    || (next.usSummary === true && !usSummary)
    || (next.gpwSummary === true && !gpwSummary);

  async function save(next) {
    // Bez subskrypcji push przełącznik nic by nie dawał — najpierw zgoda.
    if (isEnabling(next) && pushSupported && !hasSub) {
      setBusy(true); setMsg(t('pa_push_missing'));
      const r = await subscribePush();
      setBusy(false);
      if (!r.ok) { setMsg(r.reason === 'denied' ? t('push_denied') : t('pa_push_failed')); return; }
      setHasSub(true); setMsg('');
    }
    setBusy(true); setMsg('');
    const cfg = { enabled, thresholdPct: threshold, usSummary, gpwSummary, ...next };
    try {
      const r = await fetch('/api/portfolio-alert', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEnabled(cfg.enabled); setThreshold(cfg.thresholdPct); setUsSummary(cfg.usSummary); setGpwSummary(cfg.gpwSummary);
      setMsg(t('pa_saved'));
    } catch {
      setMsg(t('pa_error'));
    } finally { setBusy(false); }
  }

  async function enablePushNow() {
    setBusy(true); setMsg('');
    const r = await subscribePush();
    setBusy(false);
    if (r.ok) { setHasSub(true); setMsg(t('pa_saved')); } else setMsg(r.reason === 'denied' ? t('push_denied') : t('pa_push_failed'));
  }

  const showSubWarn = pushSupported && !hasSub && (enabled || usSummary || gpwSummary);

  return (
    <Card title={t('pa_title')}>
      <div className="grid gap-1 px-4 pb-4 pt-2">
        <p className="text-small text-dim">{t('pa_desc')}</p>
        {showSubWarn && (
          <Callout tone="warn" icon={TriangleAlert} className="my-2" action={<Button size="sm" variant="primary" icon={Bell} disabled={busy} onClick={enablePushNow}>{t('push_enable')}</Button>}>
            {t('pa_push_missing')}
          </Callout>
        )}
        <Row label={t('pa_threshold')}>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              options={[5, 10, 15, 20].map(p => ({ value: p, label: `−${p}%` }))}
              value={threshold}
              onChange={p => (enabled ? save({ thresholdPct: p }) : setThreshold(p))}
            />
            <Button size="sm" variant={enabled ? 'secondary' : 'primary'} disabled={busy} onClick={() => save({ enabled: !enabled })}>
              {enabled ? t('pa_disable') : t('pa_enable')}
            </Button>
          </div>
        </Row>
        <Row label={t('pa_session_summary_desc')}>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={usSummary ? 'secondary' : 'primary'} disabled={busy} onClick={() => save({ usSummary: !usSummary })}>
              🇺🇸 {usSummary ? t('pa_summary_off') : t('pa_summary_on')}
            </Button>
            <Button size="sm" variant={gpwSummary ? 'secondary' : 'primary'} disabled={busy} onClick={() => save({ gpwSummary: !gpwSummary })}>
              🇵🇱 {gpwSummary ? t('pa_summary_off') : t('pa_summary_on')}
            </Button>
          </div>
        </Row>
        <Note>{msg}</Note>
      </div>
    </Card>
  );
}

function NotificationToneCard() {
  const t = useT();
  const [tone, setTone] = useNotificationTone();
  const [hour, minute, setTime] = useNotificationHour();
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState(null);

  async function pushNow() {
    setPushBusy(true); setPushMsg(null);
    try {
      const { data } = await api.post('/api/push/big-move-scan');
      if (!data || data.qualifying === 0) setPushMsg({ kind: 'info', text: t('notif_push_now_empty') });
      else setPushMsg({
        kind: 'ok',
        text: t('notif_push_now_result').replace('{sent}', data.sent).replace('{qualifying}', data.qualifying).replace('{scanned}', data.scanned),
      });
    } catch {
      setPushMsg({ kind: 'err', text: t('notif_push_now_error') });
    } finally { setPushBusy(false); }
  }

  return (
    <Card title={t('notif_tone_section')}>
      <div className="grid gap-1 px-4 pb-4 pt-2">
        <Row label={t('notif_tone_label')}>
          <SegmentedControl
            options={[{ value: 'professional', label: t('notif_tone_professional') }, { value: 'funny', label: t('notif_tone_funny') }]}
            value={tone}
            onChange={setTone}
          />
        </Row>
        <p className="text-[11px] text-faint">{t('notif_tone_hint').replaceAll('{n}', NOTIFY_THRESHOLD)}</p>
        <Row label={t('notif_hour_label')}>
          <Select
            aria-label={t('notif_hour_label')}
            className="w-28"
            value={hour * 60 + minute}
            onChange={e => { const v = parseInt(e.target.value, 10); setTime(Math.floor(v / 60), v % 60); }}
          >
            {Array.from({ length: 48 }, (_, i) => {
              const h = Math.floor(i / 2), m = (i % 2) * 30;
              return <option key={i} value={h * 60 + m}>{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}</option>;
            })}
          </Select>
        </Row>
        <p className="text-[11px] text-faint">{t('notif_hour_hint')}</p>
        <div className="flex flex-wrap items-center gap-3 pt-3">
          <Button size="sm" variant="primary" icon={BellRing} loading={pushBusy} onClick={pushNow}>{t('notif_push_now')}</Button>
          {pushMsg && <Note tone={pushMsg.kind}>{pushMsg.text}</Note>}
        </div>
        <div className="pt-4">
          <p className="mb-2 text-label font-semibold uppercase text-faint">{t('notif_preview_heading')}</p>
          <NotificationCard ticker="AMD" changePct={-7.87} changeAbs={-38.96} timestampLabel={t('notif_minute_ago')} tone={tone} />
        </div>
      </div>
    </Card>
  );
}

export default function NotificationsSection() {
  return (
    <div className="space-y-4">
      <PortfolioAlertCard />
      <NotificationToneCard />
    </div>
  );
}
