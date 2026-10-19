import { useMemo, useRef, useState } from 'react';
import { FileUp, RotateCcw } from 'lucide-react';
import { useT } from '../../context/LanguageContext';
import { CSV_FIELDS, readCsv, guessMapping, rowsToTransactions } from '../../utils/transactionsCsv.js';
import { normalizeType } from '../../utils/transactions.js';
import { Badge, Button, Field, Modal, Select, Table } from '../../components/ui';
import { cx } from '../../components/ui/cx.js';

// Etykiety pól dopasowania kolumn.
const FIELD_LABEL = {
  date: 'col_date', type: 'col_type', symbol: 'col_symbol', isin: 'csv_isin', qty: 'col_qty', price: 'col_price',
  total: 'col_value', currency: 'col_currency', totalCurrency: 'csv_total_currency', fee: 'fee_label', tax: 'div_tax_label', note: 'col_note',
};

const TYPE_TONE = { BUY: 'up', SELL: 'down', DIV: 'info', CASH: 'warn' };
const TYPE_LABEL = { BUY: 'type_buy', SELL: 'type_sell', DIV: 'type_div', CASH: 'type_cash' };

// onSave(transactions, { apply }) — apply: zmienić też pozycje i gotówkę.
export default function ImportCsvModal({ onSave, onClose }) {
  const t = useT();
  const fileInputRef = useRef(null);
  // Plik: nagłówki, surowe wiersze i dopasowanie kolumn (zgadnięte, do poprawienia).
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [apply, setApply] = useState(false);
  // Dopasowanie otwarte od razu tylko, gdy zgadywanie nic nie dało; potem
  // zostaje tak, jak je zostawi użytkownik (nie zwija się w trakcie wyboru).
  const [mappingOpen, setMappingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  function readFile(file) {
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const parsed = readCsv(evt.target.result);
        if (!parsed.headers.length) throw new Error('empty');
        const guessed = guessMapping(parsed.headers);
        setFile(parsed);
        setMapping(guessed);
        setMappingOpen(rowsToTransactions(parsed.rows, guessed).valid.length === 0);
      } catch {
        setError(t('tx_csv_parse_err'));
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  const { valid: rows, skippedCount: skipped } = useMemo(
    () => (file && mapping ? rowsToTransactions(file.rows, mapping) : { valid: null, skippedCount: 0 }),
    [file, mapping],
  );

  async function handleConfirm() {
    if (!rows?.length) return;
    setSaving(true);
    setError('');
    try {
      await onSave(rows, { apply });
      onClose();
    } catch (e) {
      setError(e.message || t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { key: 'date', header: t('col_date'), render: r => <span className="text-xs text-dim">{r.date || '—'}</span> },
    { key: 'type', header: t('col_type'), render: r => { const k = normalizeType(r.type); return <Badge tone={TYPE_TONE[k] ?? 'neutral'}>{TYPE_LABEL[k] ? t(TYPE_LABEL[k]) : r.type}</Badge>; } },
    { key: 'symbol', header: t('col_symbol'), mobile: 'title', render: r => <span className="font-semibold">{r.symbol}</span> },
    { key: 'qty', header: t('qty_short'), align: 'right', render: r => r.qty ?? '—' },
    { key: 'price', header: t('price_label'), align: 'right', mobile: 'aside', render: r => `${r.price} ${r.currency}${r.fee ? ` · ${t('fee_label').toLowerCase()} ${r.fee}` : ''}${r.tax ? ` · ${t('div_tax_label').toLowerCase()} ${r.tax}` : ''}` },
    { key: 'note', header: t('col_note'), render: r => <span className="text-faint">{r.note || '—'}</span> },
  ];

  return (
    <Modal
      size="lg"
      title={t('tx_csv_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          {rows?.length > 0 && (
            <Button variant="primary" loading={saving} onClick={handleConfirm}>
              {t('tx_csv_import').replace('{n}', rows.length)}
            </Button>
          )}
        </>
      }
    >
      <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={e => readFile(e.target.files[0])} />

      {!file ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); readFile(e.dataTransfer.files[0]); }}
          className={cx(
            'flex flex-col items-center gap-3 rounded-card border border-dashed px-6 py-10 text-center transition-colors',
            dragOver ? 'border-accent bg-panel-2' : 'border-line-strong',
          )}
        >
          <span className="grid h-12 w-12 place-items-center rounded-full border border-line bg-panel-2 text-dim">
            <FileUp size={22} aria-hidden />
          </span>
          <div>
            <Button variant="primary" onClick={() => fileInputRef.current?.click()}>{t('tx_csv_choose')}</Button>
            <p className="mt-2 text-small text-faint">{t('tx_csv_drop')}</p>
          </div>
          <p className="max-w-md text-small text-dim">{t('tx_csv_columns')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="up">{t('tx_csv_valid').replace('{n}', rows.length)}</Badge>
            {skipped > 0 && <Badge tone="down">{t('tx_csv_skipped').replace('{n}', skipped)}</Badge>}
            <Button size="sm" variant="ghost" icon={RotateCcw} className="ml-auto" onClick={() => { setFile(null); setMapping(null); setError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
              {t('tx_csv_other_file')}
            </Button>
          </div>
          <details className="rounded-card-sm border border-line px-3 py-2" open={mappingOpen} onToggle={e => setMappingOpen(e.currentTarget.open)}>
            <summary className="cursor-pointer text-small font-semibold text-fg">{t('csv_mapping_title')}</summary>
            <p className="mt-1 text-[11px] text-faint">{t('csv_mapping_hint')}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CSV_FIELDS.map(f => (
                <Field key={f} label={t(FIELD_LABEL[f])}>
                  <Select
                    value={mapping[f] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [f]: e.target.value === '' ? null : Number(e.target.value) }))}
                  >
                    <option value="">{t('csv_none')}</option>
                    {file.headers.map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
          </details>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={apply} onChange={e => setApply(e.target.checked)} />
            <span>
              <span className="block text-[13px] text-fg">{t('csv_apply')}</span>
              <span className="block text-[11px] text-faint">{t('csv_apply_hint')}</span>
            </span>
          </label>
          {rows.length > 0 && (
            <div className="overflow-hidden rounded-card-sm border border-line">
              <Table columns={columns} rows={rows} rowKey={r => r.id} pageSize={20} />
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-small text-down">{error}</p>}
    </Modal>
  );
}
