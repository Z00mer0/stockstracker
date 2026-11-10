import { useState } from 'react';
import { Home, Gem, Landmark, Car, Package, CandlestickChart, Plus, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import { usePrivacy } from '../../context/PrivacyContext';
import ConfirmModal from '../../components/ConfirmModal';
import { Button, Card, Field, IconButton, Input, Modal, Select, Table } from '../../components/ui';
import { defaultMultiplier } from '../../utils/futures.js';

// Nieruchomości, lokaty, złoto, pojazdy — wyceniane ręcznie.

function getAssetCategories(t) {
  return {
    real_estate: { label: t('asset_cat_real_estate'), icon: Home },
    metals:      { label: t('asset_cat_metals'), icon: Gem },
    savings:     { label: t('asset_cat_savings'), icon: Landmark },
    vehicle:     { label: t('asset_cat_vehicle'), icon: Car },
    futures:     { label: t('asset_cat_futures'), icon: CandlestickChart },
    other:       { label: t('asset_cat_other'), icon: Package },
  };
}
const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];

function OtherAssetModal({ initial, onSave, onClose }) {
  const t = useT();
  const categories = getAssetCategories(t);
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'other');
  const [value, setValue] = useState(initial?.principal ?? initial?.margin ?? initial?.value ?? '');
  const fut = initial?.future;
  const [code, setCode] = useState(fut?.code ?? '');
  const [side, setSide] = useState(fut?.side ?? 'long');
  const [contracts, setContracts] = useState(fut?.contracts ?? '');
  const [multiplier, setMultiplier] = useState(fut?.multiplier ?? '');
  const [entryPrice, setEntryPrice] = useState(fut?.entryPrice ?? '');
  const isFuture = category === 'futures';
  const dep = initial?.deposit;
  const [mode, setMode] = useState(dep?.kind ?? 'manual');
  const [rate, setRate] = useState(dep?.rate ?? '');
  const [startDate, setStartDate] = useState(dep?.startDate ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(dep?.endDate ?? '');
  const [belka, setBelka] = useState(dep?.belka !== false);
  const isDeposit = category === 'savings' && mode !== 'manual';
  const [currency, setCurrency] = useState(initial?.currency ?? 'PLN');
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim()) { setError(t('enter_name')); return; }
    const v = parseFloat(value);
    if (isNaN(v) || v < 0) { setError(t('enter_value_err')); return; }
    let deposit;
    if (isDeposit) {
      const r = parseFloat(rate);
      if (isNaN(r) || r <= 0) { setError(t('dep_err_rate')); return; }
      if (!startDate || (mode === 'term' && (!endDate || endDate <= startDate))) { setError(t('dep_err_dates')); return; }
      deposit = { kind: mode, rate: r, startDate, ...(mode === 'term' ? { endDate } : {}), belka };
    }
    let future;
    if (isFuture) {
      const c = parseFloat(contracts), e = parseFloat(entryPrice);
      const m = parseFloat(multiplier) || defaultMultiplier(code);
      if (!code.trim() || !(c > 0) || !(e > 0)) { setError(t('fut_err')); return; }
      future = { code: code.trim().toUpperCase(), side, contracts: c, multiplier: m, entryPrice: e };
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), category, value: v, currency, note: note.trim(), deposit, future });
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
        {category === 'savings' && (
          <Field label={t('dep_mode_label')}>
            <Select value={mode} onChange={e => setMode(e.target.value)}>
              <option value="term">{t('dep_mode_term')}</option>
              <option value="savings">{t('dep_mode_savings')}</option>
              <option value="manual">{t('dep_mode_manual')}</option>
            </Select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={isDeposit ? t('dep_amount_label') : isFuture ? t('fut_margin_label') : t('asset_value_label')}>
            <Input type="number" min="0" step="any" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} />
          </Field>
          <Field label={t('currency_label')}>
            <Select value={currency} onChange={e => setCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        {isFuture && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('fut_code_label')} hint={t('fut_code_hint')} className="sm:col-span-2">
              <Input placeholder="FW20Z2620" value={code} onChange={e => setCode(e.target.value)} />
            </Field>
            <Field label={t('fut_side_label')}>
              <Select value={side} onChange={e => setSide(e.target.value)}>
                <option value="long">{t('fut_long')}</option>
                <option value="short">{t('fut_short')}</option>
              </Select>
            </Field>
            <Field label={t('fut_contracts_label')}>
              <Input type="number" min="0" step="1" inputMode="numeric" value={contracts} onChange={e => setContracts(e.target.value)} />
            </Field>
            <Field label={t('fut_entry_label')}>
              <Input type="number" min="0" step="any" inputMode="decimal" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} />
            </Field>
            <Field label={t('fut_multiplier_label')}>
              <Input type="number" min="0" step="any" inputMode="decimal" placeholder={String(defaultMultiplier(code))} value={multiplier} onChange={e => setMultiplier(e.target.value)} />
            </Field>
            <p className="text-small text-faint sm:col-span-2">{t('fut_auto_hint')}</p>
          </div>
        )}
        {isDeposit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('dep_rate_label')}>
              <Input type="number" min="0" step="0.01" inputMode="decimal" suffix="%" value={rate} onChange={e => setRate(e.target.value)} />
            </Field>
            <Field label={t('dep_start_label')}>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </Field>
            {mode === 'term' && (
              <Field label={t('dep_end_label')}>
                <Input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
              </Field>
            )}
            <label className="flex cursor-pointer items-start gap-3 self-end pb-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={belka} onChange={e => setBelka(e.target.checked)} />
              <span className="text-[13px] text-fg">{t('dep_belka')}</span>
            </label>
            <p className="text-small text-faint sm:col-span-2">{t('dep_auto_hint')}</p>
          </div>
        )}
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
  const fmtLocal2 = n => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const blur = isPrivate ? 'privacy-blur' : undefined;
  const depositInfo = a => {
    if (a.matured) return t('dep_matured');
    const rate = a.deposit.rate.toLocaleString(locale);
    return a.deposit.kind === 'savings'
      ? t('dep_info_savings').replace('{rate}', rate)
      : t('dep_info_term').replace('{rate}', rate).replace('{date}', a.deposit.endDate);
  };

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
        return (
          <span className="inline-flex items-center gap-2">
            <Icon size={15} aria-hidden className="shrink-0 text-dim" />
            <span>
              <span className="block font-semibold text-fg">{a.name}</span>
              {a.deposit && <span className={`block text-[11px] ${a.matured ? 'text-warn' : 'text-faint'}`}>{depositInfo(a)}</span>}
              {a.future && (
                <span className="block text-[11px] text-faint">
                  {t(a.future.side === 'short' ? 'fut_short' : 'fut_long')} {a.future.contracts} × {a.future.code} @ {a.future.entryPrice.toLocaleString(locale)}
                  {a.futurePrice != null ? ` · ${t('fut_now')} ${a.futurePrice.toLocaleString(locale)}` : ` · ${t('fut_no_quote')}`}
                </span>
              )}
            </span>
          </span>
        );
      },
    },
    { key: 'category', header: t('col_category'), render: a => <span className="text-small text-dim">{(categories[a.category] ?? categories.other).label}</span> },
    {
      key: 'value', header: t('col_value'), align: 'right',
      render: a => (
        <span className={blur}>
          {fmtLocal(a.value)} {a.currency}
          {a.deposit && a.interest > 0 && <span className="block text-[11px] text-up">{t('dep_interest').replace('{amount}', fmtLocal2(a.interest))}</span>}
          {a.future && a.pl != null && <span className={`block text-[11px] ${a.pl >= 0 ? 'text-up' : 'text-down'}`}>{t('fut_pl').replace('{amount}', `${a.pl >= 0 ? '+' : ''}${fmtLocal2(a.pl)}`)}</span>}
        </span>
      ),
    },
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
