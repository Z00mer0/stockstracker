import { useEffect, useState } from 'react';
import { Flag, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../hooks/useApi';
import { useLanguage, useT } from '../context/LanguageContext';
import { usePrivacy } from '../context/PrivacyContext';
import { goalProgress, GOAL_RETURN, GOAL_YIELD } from '../utils/goals.js';
import ConfirmModal from './ConfirmModal';
import { Button, Card, Field, IconButton, Input, Modal, SegmentedControl } from './ui';
import { cx } from './ui/cx.js';

// Cele inwestycyjne na Dashboardzie: „1 mln do 2035”, „2000 zł dywidend
// miesięcznie”. Zapisane na serwerze (/api/goals) — te same na każdym
// urządzeniu. Kwoty celów w PLN; okno pokazuje je w walucie wyświetlania.
function GoalModal({ initial, dispFx, currLabel, onSave, onClose }) {
  const t = useT();
  const [kind, setKind] = useState(initial?.kind ?? 'value');
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState(initial?.target != null ? String(Math.round(initial.target / dispFx)) : '');
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const amount = parseFloat(String(target).replace(/\s/g, '').replace(',', '.'));

  async function save() {
    if (!(amount > 0)) { setError(t('goal_err_amount')); return; }
    setSaving(true);
    try {
      await onSave({ id: initial?.id ?? Math.random().toString(36).slice(2, 10), kind, name: name.trim() || t(kind === 'value' ? 'goal_kind_value' : 'goal_kind_div'), target: amount * dispFx, deadline: deadline || null });
      onClose();
    } catch (e) { setError(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal size="sm" title={initial ? t('goal_edit') : t('goal_add')} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" loading={saving} onClick={save}>{t('save_btn')}</Button></>}>
      <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save(); }}>
        <SegmentedControl block aria-label={t('goal_kind')} options={[{ value: 'value', label: t('goal_kind_value') }, { value: 'dividends', label: t('goal_kind_div') }]} value={kind} onChange={setKind} />
        <Field label={t('goal_name')}><Input value={name} onChange={e => setName(e.target.value)} placeholder={t(kind === 'value' ? 'goal_name_ph_value' : 'goal_name_ph_div')} /></Field>
        <Field label={t(kind === 'value' ? 'goal_target_value' : 'goal_target_div')}>
          <Input type="text" inputMode="decimal" suffix={kind === 'value' ? currLabel : `${currLabel}/${t('goal_month_short')}`} value={target} onChange={e => setTarget(e.target.value)} placeholder={kind === 'value' ? '1000000' : '2000'} />
        </Field>
        <Field label={t('goal_deadline')} hint={t('goal_deadline_hint')}><Input type="month" value={deadline} onChange={e => setDeadline(e.target.value)} /></Field>
        {error && <p role="alert" className="text-small text-down">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function GoalsCard({ value, monthlyDividends, dispFx = 1, currLabel = 'zł' }) {
  const t = useT();
  const { locale } = useLanguage();
  const { isPrivate } = usePrivacy();
  const [goals, setGoals] = useState(null);
  const [edit, setEdit] = useState(null);       // null | {} (nowy) | goal
  const [del, setDel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/goals').then(r => { if (!cancelled) setGoals(Array.isArray(r.data) ? r.data : []); }).catch(() => { if (!cancelled) setGoals([]); });
    return () => { cancelled = true; };
  }, []);

  async function persist(next) {
    await api.post('/api/goals', { goals: next });
    setGoals(next);
  }
  const upsert = g => persist(goals.some(x => x.id === g.id) ? goals.map(x => (x.id === g.id ? g : x)) : [...goals, g]);

  const money = v => `${Math.round(v / dispFx).toLocaleString(locale)} ${currLabel}`;
  const blur = isPrivate ? 'privacy-blur' : '';
  if (goals == null) return null;

  return (
    <Card className="mb-4" title={<span className="inline-flex items-center gap-2"><Flag size={15} aria-hidden className="text-dim" />{t('goals_title')}</span>}
      actions={<Button size="sm" icon={Plus} onClick={() => setEdit({})}>{t('goal_add')}</Button>}>
      <div className="grid gap-3 px-4 py-3">
        {goals.length === 0 && <p className="text-small text-faint">{t('goals_empty')}</p>}
        {goals.map(g => {
          const p = goalProgress(g, { value, monthlyDividends });
          const unit = g.kind === 'dividends' ? `/${t('goal_month_short')}` : '';
          let hint;
          if (p.done) hint = t('goal_done');
          else if (p.overdue) hint = t('goal_overdue');
          else if (p.monthly != null) hint = t(g.kind === 'dividends' ? 'goal_hint_div_monthly' : 'goal_hint_monthly').replace('{amount}', money(p.monthly)).replace('{pct}', String(GOAL_RETURN * 100)).replace('{capital}', money(p.capitalNeeded ?? 0)).replace('{yield}', String(GOAL_YIELD * 100));
          else if (g.kind === 'dividends') hint = t('goal_hint_div').replace('{capital}', money(p.capitalNeeded)).replace('{yield}', String(GOAL_YIELD * 100));
          return (
            <div key={g.id} className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-fg">{g.name}{g.deadline && <span className="ml-2 text-small font-normal text-faint">{t('goal_by')} {new Date(`${g.deadline}-15T12:00:00`).toLocaleDateString(locale, { month: 'short', year: 'numeric' })}</span>}</span>
                <span className={cx('shrink-0 text-small tabular-nums text-dim', blur)}>{money(p.current)}{unit} / {money(p.target)}{unit}</span>
                <IconButton icon={Pencil} size="sm" label={t('goal_edit')} onClick={() => setEdit(g)} />
                <IconButton icon={Trash2} size="sm" label={t('delete')} onClick={() => setDel(g)} />
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuenow={Math.round(p.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={g.name}>
                <div className={cx('h-full rounded-full', p.done ? 'bg-up' : 'bg-accent')} style={{ width: `${p.pct}%` }} />
              </div>
              <p className={cx('text-[11px]', p.done ? 'text-up' : p.overdue ? 'text-warn' : 'text-faint', blur)}>{Math.round(p.pct)}% · {hint}</p>
            </div>
          );
        })}
      </div>
      {edit && <GoalModal initial={edit.id ? edit : null} dispFx={dispFx} currLabel={currLabel} onSave={upsert} onClose={() => setEdit(null)} />}
      {del && <ConfirmModal message={t('goal_delete_confirm').replace('{name}', del.name)} onConfirm={() => { const g = del; setDel(null); persist(goals.filter(x => x.id !== g.id)); }} onCancel={() => setDel(null)} />}
    </Card>
  );
}
