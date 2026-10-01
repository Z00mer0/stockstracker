import { useState, useEffect } from 'react';
import { BookOpen, Pencil, RotateCcw } from 'lucide-react';
import { useLanguage, useT } from '../context/LanguageContext';
import { getThesis } from '../services/journalService';
import { Button, Field, Input, Modal, SegmentedControl } from './ui';
import { cx } from './ui/cx.js';

export default function SellStockModal({ holding, onSave, onClose }) {
  const t = useT();
  const { locale } = useLanguage();
  // Waluta sprzedaży = waluta pozycji. Wcześniej dało się wybrać inną, a koszt
  // (costBasis) zostawał w walucie pozycji — wynik mieszał złotówki z dolarami.
  const currency = holding?.currency ?? 'PLN';
  const [qty, setQty]           = useState('');
  const [price, setPrice]       = useState(holding?.price ?? holding?.avgPrice ?? '');
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [editingPL, setEditingPL] = useState(false);
  const [manualPL, setManualPL]   = useState('');
  const [thesis, setThesis]       = useState('');
  const [verdict, setVerdict]     = useState('');
  const [retroNote, setRetroNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    getThesis(holding?.symbol).then(text => { if (!cancelled) setThesis(text); }).catch(() => {});
    return () => { cancelled = true; };
  }, [holding?.symbol]);

  const q   = parseFloat(qty);
  const p   = parseFloat(price);
  const avg = holding?.avgPrice;
  const calcPL = (!isNaN(q) && q > 0 && !isNaN(p) && p > 0 && avg)
    ? (p - avg) * q
    : null;

  function startEditPL() {
    if (calcPL != null && manualPL === '') setManualPL(calcPL.toFixed(2));
    setEditingPL(true);
  }

  function resetPL() {
    setManualPL('');
    setEditingPL(false);
  }

  const effectivePL = editingPL && manualPL !== '' ? parseFloat(manualPL) : calcPL;
  const fmt = n => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function handleSave(e) {
    e?.preventDefault();
    if (isNaN(q) || q <= 0) { setError(t('err_enter_qty_short')); return; }
    if (q > (holding?.qty ?? 0)) { setError(`${t('err_too_many_shares')} ${holding.qty}`); return; }
    if (isNaN(p) || p <= 0) { setError(t('err_enter_sell_price')); return; }
    if (thesis && !verdict) { setError(t('journal_verdict_required')); return; }
    setSaving(true); setError('');
    try {
      const overridePL = (editingPL && manualPL !== '' && !isNaN(parseFloat(manualPL)))
        ? parseFloat(manualPL)
        : undefined;
      const retro = {
        hadThesis: !!thesis,
        ...(thesis ? { thesis } : {}),
        ...(verdict && verdict !== 'skip' ? { verdict } : {}),
        ...(retroNote.trim() ? { note: retroNote.trim() } : {}),
      };
      await onSave({ symbol: holding.symbol, qty: q, price: p, currency, date, note: note.trim(), overridePL, retro });
      onClose();
    } catch (err) {
      setError(err.message || t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`${t('sell_title')} ${holding?.symbol ?? ''}`}
      description={`${t('already_own_prefix')} ${holding?.qty} ${t('already_own_suffix')} ${holding?.avgPrice} ${currency}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="danger" type="submit" form="sell-form" loading={saving}>{t('sell_title')}</Button>
        </>
      }
    >
      <form id="sell-form" onSubmit={handleSave} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('sell_qty_label')}>
            <div className="flex gap-2">
              <Input type="number" min="0" step="any" inputMode="decimal" className="min-w-0 flex-1" placeholder={`max ${holding?.qty}`} value={qty} onChange={e => setQty(e.target.value)} />
              <Button size="sm" className="h-9" onClick={() => setQty(String(holding?.qty ?? ''))}>{t('sell_all')}</Button>
            </div>
          </Field>
          <Field label={t('sell_price_label')}>
            <Input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} suffix={currency} />
          </Field>
          <Field label={t('sell_date_label')}>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
          <Field label={t('note_optional')}>
            <Input placeholder={t('note_placeholder')} value={note} onChange={e => setNote(e.target.value)} />
          </Field>
        </div>

        {calcPL != null && (
          <div className="rounded-card-sm border border-line bg-panel-2 px-3 py-2.5 text-small">
            {editingPL ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-faint">{t('manual_result')}:</span>
                <Input type="number" step="any" aria-label={t('manual_result')} className="min-w-0 flex-1" value={manualPL} onChange={e => setManualPL(e.target.value)} suffix={currency} />
                <Button size="sm" variant="ghost" icon={RotateCcw} onClick={resetPL}>{t('restore_auto')}</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="text-faint">{t('est_result')}: </span>
                  <span className={cx('font-semibold tabular-nums', effectivePL >= 0 ? 'text-up' : 'text-down')}>
                    {effectivePL >= 0 ? '+' : ''}{fmt(effectivePL)} {currency} ({(((p - avg) / avg) * 100).toFixed(2)}%)
                  </span>
                </span>
                <Button size="sm" variant="ghost" icon={Pencil} onClick={startEditPL}>{t('edit_pl')}</Button>
              </div>
            )}
          </div>
        )}

        {thesis && (
          <div className="grid gap-2 rounded-card-sm border border-line bg-panel-2 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] text-faint"><BookOpen size={13} aria-hidden />{t('journal_thesis_label')}:</p>
            <p className="max-h-16 overflow-auto whitespace-pre-wrap text-small italic text-dim">{thesis}</p>
            <p className="text-small font-semibold text-fg">{t('journal_verdict_q')}</p>
            <SegmentedControl
              block
              aria-label={t('journal_verdict_q')}
              options={[['hit', 'journal_hit'], ['partial', 'journal_partial'], ['miss', 'journal_miss'], ['skip', 'journal_skip']].map(([value, key]) => ({ value, label: t(key) }))}
              value={verdict}
              onChange={v => { setVerdict(verdict === v ? '' : v); setError(''); }}
            />
            {verdict && verdict !== 'skip' && (
              <Input aria-label={t('journal_retro_note_ph')} placeholder={t('journal_retro_note_ph')} value={retroNote} onChange={e => setRetroNote(e.target.value)} />
            )}
          </div>
        )}

        {error && <p role="alert" className="text-small text-down">{error}</p>}
      </form>
    </Modal>
  );
}
