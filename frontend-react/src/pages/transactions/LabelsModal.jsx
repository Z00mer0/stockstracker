import { useState } from 'react';
import { useT } from '../../context/LanguageContext';
import { Button, Field, Input, Modal } from '../../components/ui';
import { parseLabels } from '../../utils/labels.js';

// Etykiety jednej transakcji albo wszystkich transakcji tej samej spółki.
// onSave(labels, wholeSymbol)
export default function LabelsModal({ tx, known = [], onSave, onClose }) {
  const t = useT();
  const [text, setText] = useState((tx.labels ?? []).join(', '));
  const [whole, setWhole] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const current = parseLabels(text);
  const suggestions = known.filter(l => !current.includes(l));

  async function save() {
    setSaving(true);
    try { await onSave(current, whole); onClose(); }
    catch (e) { setError(e.message || t('save_error')); }
    finally { setSaving(false); }
  }

  return (
    <Modal size="sm" title={t('lbl_edit_title')} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" loading={saving} onClick={save}>{t('save_btn')}</Button></>}>
      <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save(); }}>
        <Field label={t('lbl_field')} hint={t('lbl_hint')}>
          <Input value={text} onChange={e => setText(e.target.value)} placeholder={t('lbl_ph')} autoFocus />
        </Field>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(l => (
              <Button key={l} size="sm" onClick={() => setText([...current, l].join(', '))}>+ {l}</Button>
            ))}
          </div>
        )}
        {tx.symbol && (
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={whole} onChange={e => setWhole(e.target.checked)} />
            <span className="text-[13px] text-fg">{t('lbl_whole_symbol').replace('{symbol}', tx.symbol)}</span>
          </label>
        )}
        {error && <p role="alert" className="text-small text-down">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
