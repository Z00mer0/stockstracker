import { useState } from 'react';
import { Home, Gem, Landmark, Car, Package, Plus, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import { usePrivacy } from '../../context/PrivacyContext';
import ConfirmModal from '../../components/ConfirmModal';
import { Button, Card, Field, IconButton, Input, Modal, Select, Table } from '../../components/ui';

// Nieruchomości, lokaty, złoto, pojazdy — wyceniane ręcznie.

function getAssetCategories(t) {
  return {
    real_estate: { label: t('asset_cat_real_estate'), icon: Home },
    metals:      { label: t('asset_cat_metals'), icon: Gem },
    savings:     { label: t('asset_cat_savings'), icon: Landmark },
    vehicle:     { label: t('asset_cat_vehicle'), icon: Car },
    other:       { label: t('asset_cat_other'), icon: Package },
  };
}
const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];

function OtherAssetModal({ initial, onSave, onClose }) {
  const t = useT();
  const categories = getAssetCategories(t);
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'other');
  const [value, setValue] = useState(initial?.value ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'PLN');
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim()) { setError(t('enter_name')); return; }
    const v = parseFloat(value);
    if (isNaN(v) || v < 0) { setError(t('enter_value_err')); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), category, value: v, currency, note: note.trim() });
      onClose();
    } catch (e) {
      setError(e.message || t('save_error'));
    } finally { setSaving(false); }
  }

  return (
    <Modal
      size="sm"
      title={initial ? t('asset_edit_title') : t('asset_add_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{t('save_btn')}</Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={e => { e.preventDefault(); handleSave(); }}>
        <Field label={t('asset_name_label')}>
          <Input placeholder={t('pf_asset_name_ph')} value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label={t('asset_category_label')}>
          <Select value={category} onChange={e => setCategory(e.target.value)}>
            {Object.entries(categories).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('asset_value_label')}>
            <Input type="number" min="0" step="any" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} />
          </Field>
          <Field label={t('currency_label')}>
            <Select value={currency} onChange={e => setCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t('note_optional')}>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder={t('asset_note_placeholder')} />
        </Field>
        {error && <p role="alert" className="text-small text-down">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function OtherAssetsSection() {
  const { otherAssets, addOtherAsset, editOtherAsset, deleteOtherAsset, fxRates, displayCurrency, canWrite } = useApp();
  const t = useT();
  const { locale } = useLanguage();
  const { isPrivate } = usePrivacy();
  const categories = getAssetCategories(t);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const fx = fxRates[displayCurrency] ?? 1;
  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const totalPLN = otherAssets.reduce((s, a) => s + (a.value || 0) * (fxRates[a.currency] ?? 1), 0);
  const fmtLocal = n => n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const blur = isPrivate ? 'privacy-blur' : undefined;

  const openAdd = () => { setEditTarget(null); setShowModal(true); };

  const modals = (
    <>
      {showModal && (
        <OtherAssetModal
          initial={editTarget}
          onSave={async data => {
            if (editTarget) await editOtherAsset(editTarget.id, data);
            else await addOtherAsset(data);
          }}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          message={t('pf_delete_confirm').replace('{name}', confirmDel.name)}
          onConfirm={() => { const a = confirmDel; setConfirmDel(null); deleteOtherAsset(a.id); }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </>
  );

  if (!otherAssets.length) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-card-title text-fg">{t('other_assets')}</p>
            <p className="mt-0.5 text-small text-faint">{t('real_estate_hint')}</p>
          </div>
          {canWrite && <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>{t('add')}</Button>}
        </div>
        {modals}
      </Card>
    );
  }

  const columns = [
    {
      key: 'name', header: t('col_name'), mobile: 'title',
      render: a => {
        const Icon = (categories[a.category] ?? categories.other).icon;
        return <span className="inline-flex items-center gap-2 font-semibold text-fg"><Icon size={15} aria-hidden className="shrink-0 text-dim" />{a.name}</span>;
      },
    },
    { key: 'category', header: t('col_category'), render: a => <span className="text-small text-dim">{(categories[a.category] ?? categories.other).label}</span> },
    { key: 'value', header: t('col_value'), align: 'right', render: a => <span className={blur}>{fmtLocal(a.value)} {a.currency}</span> },
    {
      key: 'approx', header: `≈ ${displayCurrency}`, align: 'right', mobile: 'aside',
      render: a => <span className={blur}>{fmtLocal(((a.value || 0) * (fxRates[a.currency] ?? 1)) / fx)} {currLabel}</span>,
    },
    { key: 'note', header: t('col_note'), render: a => <span className="text-[11px] text-faint">{a.note || '—'}</span> },
    { key: 'updatedAt', header: t('col_last_updated'), render: a => <span className="text-[11px] text-faint">{a.updatedAt || '—'}</span> },
  ];
  if (canWrite) {
    columns.push({
      key: 'actions', header: '', align: 'right',
      render: a => (
        <span className="inline-flex gap-1">
          <IconButton icon={Pencil} size="sm" label={`${t('edit')}: ${a.name}`} onClick={() => { setEditTarget(a); setShowModal(true); }} />
          <IconButton icon={Trash2} size="sm" label={`${t('delete_btn')}: ${a.name}`} onClick={() => setConfirmDel(a)} />
        </span>
      ),
    });
  }

  return (
    <Card
      title={
        <span>
          {t('other_assets')}
          {totalPLN > 0 && <span className={`ml-2.5 text-xs font-normal text-faint ${blur ?? ''}`}>≈ {fmtLocal(totalPLN / fx)} {currLabel} {t('total_approx')}</span>}
        </span>
      }
      actions={canWrite && <Button size="sm" icon={Plus} onClick={openAdd}>{t('add')}</Button>}
    >
      <Table columns={columns} rows={otherAssets} rowKey={a => a.id} />
      {modals}
    </Card>
  );
}
