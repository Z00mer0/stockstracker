import { useEffect, useMemo, useState } from 'react';
import { Landmark, Plus, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import { usePrivacy } from '../../context/PrivacyContext';
import { fetchCpiSeries, valueBond, BOND_TYPES } from '../../services/bondService';
import ConfirmModal from '../../components/ConfirmModal';
import { Badge, Button, Card, Field, IconButton, Input, Modal, Select, Table } from '../../components/ui';

// Obligacje skarbowe EDO/COI — wycena indeksowana inflacją (CPI).

function BondModal({ initial, onSave, onClose }) {
  const t = useT();
  const eg = v => t('pf_eg').replace('{v}', v);
  const [type, setType] = useState(initial?.type ?? 'EDO');
  const [name, setName] = useState(initial?.name ?? '');
  const [date, setDate] = useState(initial?.purchaseDate ?? new Date().toISOString().slice(0, 10));
  const [count, setCount] = useState(initial?.count ?? '');
  const [rate1, setRate1] = useState(initial?.firstYearRate ?? '');
  const [margin, setMargin] = useState(initial?.margin ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim()) { setError(t('enter_name')); return; }
    const c = parseInt(count, 10);
    if (!c || c < 1) { setError(t('bond_count_err')); return; }
    setSaving(true);
    try {
      await onSave({
        type, name: name.trim(), purchaseDate: date,
        count: c, firstYearRate: parseFloat(rate1) || 0, margin: parseFloat(margin) || 0,
      });
      onClose();
    } catch (e) {
      setError(e.message || t('save_error'));
    } finally { setSaving(false); }
  }

  return (
    <Modal
      size="sm"
      title={initial ? t('bond_edit_title') : t('bond_add_title')}
      description={t('bond_modal_hint')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{t('save_btn')}</Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); handleSave(); }}>
        <Field label={t('bond_type')}>
          <Select value={type} onChange={e => setType(e.target.value)}>
            <option value="EDO">EDO (10L)</option>
            <option value="COI">COI (4L)</option>
          </Select>
        </Field>
        <Field label={t('bond_series')}>
          <Input placeholder={t('bond_series_ph')} value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label={t('bond_purchase_date')}>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label={t('bond_count')}>
          <Input type="number" min="1" step="1" inputMode="numeric" value={count} onChange={e => setCount(e.target.value)} placeholder={eg('50')} />
        </Field>
        <Field label={t('bond_first_rate')}>
          <Input type="number" min="0" step="0.01" inputMode="decimal" suffix="%" value={rate1} onChange={e => setRate1(e.target.value)} placeholder={eg('6.55')} />
        </Field>
        <Field label={t('bond_margin')}>
          <Input type="number" min="0" step="0.01" inputMode="decimal" suffix="%" value={margin} onChange={e => setMargin(e.target.value)} placeholder={eg('2.00')} />
        </Field>
        {error && <p role="alert" className="text-small text-down sm:col-span-2">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function BondsSection() {
  const { bonds, addBond, editBond, deleteBond, canWrite } = useApp();
  const t = useT();
  const { locale } = useLanguage();
  const { isPrivate } = usePrivacy();
  const [cpiMap, setCpiMap] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  useEffect(() => {
    if (bonds.length) fetchCpiSeries().then(setCpiMap);
  }, [bonds.length]);

  const valued = useMemo(
    () => bonds.map(b => ({ ...b, v: valueBond(b, cpiMap ?? new Map()) })),
    [bonds, cpiMap],
  );
  const totalValue = valued.reduce((s, b) => s + b.v.totalValue, 0);

  const fmt = n => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = r => (r * 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  const blur = isPrivate ? 'privacy-blur' : undefined;
  const openAdd = () => { setEditTarget(null); setShowModal(true); };

  const modals = (
    <>
      {showModal && (
        <BondModal
          initial={editTarget}
          onSave={async data => {
            if (editTarget) await editBond(editTarget.id, data);
            else await addBond(data);
          }}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          message={t('pf_delete_confirm').replace('{name}', confirmDel.name)}
          onConfirm={() => { const b = confirmDel; setConfirmDel(null); deleteBond(b.id); }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </>
  );

  if (!bonds.length) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-card-title text-fg">{t('bonds_title')}</p>
            <p className="mt-0.5 text-small text-faint">{t('bonds_hint')}</p>
          </div>
          {canWrite && <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>{t('add')}</Button>}
        </div>
        {modals}
      </Card>
    );
  }

  const columns = [
    {
      key: 'name', header: t('bond_series'), mobile: 'title',
      render: b => (
        <span className="inline-flex flex-wrap items-center gap-2 font-semibold text-fg">
          <Landmark size={15} aria-hidden className="shrink-0 text-dim" />{b.name}
          {b.v.matured && <Badge tone="warn">{t('bond_matured')}</Badge>}
        </span>
      ),
    },
    { key: 'type', header: t('bond_type'), render: b => <span className="text-small text-dim">{b.type} · {BOND_TYPES[b.type]?.years ?? '—'}L</span> },
    { key: 'purchaseDate', header: t('bond_purchase_date'), render: b => <span className="text-small text-dim">{b.purchaseDate}</span> },
    { key: 'count', header: t('bond_count'), align: 'right', render: b => <span className={blur}>{b.count}</span> },
    { key: 'nominal', header: t('col_nominal'), align: 'right', render: b => <span className={`text-dim ${blur ?? ''}`}>{fmt(b.v.totalNominal)} zł</span> },
    { key: 'rate', header: t('col_bond_rate'), align: 'right', render: b => <span className="text-up">{fmtPct(b.v.currentRate)}</span> },
    { key: 'value', header: t('col_bond_value'), align: 'right', mobile: 'aside', render: b => <span className={blur}>{fmt(b.v.totalValue)} zł</span> },
    { key: 'redeem', header: t('col_bond_redeem'), align: 'right', render: b => <span className={`text-dim ${blur ?? ''}`}>{fmt(b.v.redeemTodayTotal)} zł</span> },
  ];
  if (canWrite) {
    columns.push({
      key: 'actions', header: '', align: 'right',
      render: b => (
        <span className="inline-flex gap-1">
          <IconButton icon={Pencil} size="sm" label={`${t('edit')}: ${b.name}`} onClick={() => { setEditTarget(b); setShowModal(true); }} />
          <IconButton icon={Trash2} size="sm" label={`${t('delete_btn')}: ${b.name}`} onClick={() => setConfirmDel(b)} />
        </span>
      ),
    });
  }

  return (
    <Card
      title={
        <span>
          {t('bonds_title')}
          {totalValue > 0 && <span className={`ml-2.5 text-xs font-normal text-faint ${blur ?? ''}`}>≈ {fmt(totalValue)} zł</span>}
        </span>
      }
      actions={canWrite && <Button size="sm" icon={Plus} onClick={openAdd}>{t('add')}</Button>}
    >
      <Table columns={columns} rows={valued} rowKey={b => b.id} />
      <p className="px-4 pb-3.5 pt-2.5 text-[11px] text-faint">{t('bonds_estimate_note')}</p>
      {modals}
    </Card>
  );
}
