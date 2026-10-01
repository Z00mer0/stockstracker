import { useRef, useState } from 'react';
import { FileUp, RotateCcw } from 'lucide-react';
import { useT } from '../../context/LanguageContext';
import { parseTransactionsCsv } from '../../utils/transactionsCsv.js';
import { normalizeType } from '../../utils/transactions.js';
import { Badge, Button, Modal, Table } from '../../components/ui';
import { cx } from '../../components/ui/cx.js';

const TYPE_TONE = { BUY: 'up', SELL: 'down', DIV: 'info', CASH: 'warn' };
const TYPE_LABEL = { BUY: 'type_buy', SELL: 'type_sell', DIV: 'type_div', CASH: 'type_cash' };

export default function ImportCsvModal({ existingTransactions, onSave, onClose }) {
  const t = useT();
  const fileInputRef = useRef(null);
  const [rows, setRows] = useState(null);
  const [skipped, setSkipped] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  function readFile(file) {
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const { valid, skippedCount } = parseTransactionsCsv(evt.target.result);
        setRows(valid);
        setSkipped(skippedCount);
      } catch {
        setError(t('tx_csv_parse_err'));
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  async function handleConfirm() {
    if (!rows?.length) return;
    setSaving(true);
    try {
      await onSave([...existingTransactions, ...rows]);
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
    { key: 'price', header: t('price_label'), align: 'right', mobile: 'aside', render: r => `${r.price} ${r.currency}` },
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
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => readFile(e.target.files[0])} />

      {!rows ? (
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
            <Button size="sm" variant="ghost" icon={RotateCcw} className="ml-auto" onClick={() => { setRows(null); setSkipped(0); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
              {t('tx_csv_other_file')}
            </Button>
          </div>
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
