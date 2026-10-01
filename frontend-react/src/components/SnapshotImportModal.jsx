import { useState } from 'react';
import { CircleCheck, Upload } from 'lucide-react';
import { useT } from '../context/LanguageContext';
import { parsePdf, parseImage } from '../utils/snapshotImport.js';
import { Button, Callout, FileDrop, Modal, Table } from './ui';

function genId() { return Math.random().toString(36).slice(2, 10); }

export default function SnapshotImportModal({ onSave, onClose }) {
  const t = useT();
  const [result, setResult]     = useState(null);
  const [parsing, setParsing]   = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');

  async function handleFile(file) {
    if (!file) return;
    setError(''); setSaved(false); setResult(null); setOcrStatus('');
    const ext = file.name.split('.').pop().toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg'].includes(ext);
    const isPdf   = ext === 'pdf';
    if (!isPdf && !isImage) {
      setError(t('si_formats'));
      return;
    }
    setParsing(true);
    try {
      let parsed;
      if (isPdf) {
        const buffer = await file.arrayBuffer();
        parsed = await parsePdf(buffer);
      } else {
        setOcrStatus(t('si_ocr_loading'));
        // Pass raw image URL — Tesseract can read Blob/File directly
        parsed = await parseImage(file);
        setOcrStatus('');
      }
      if (!parsed.positions.length) {
        setError(t('si_no_positions'));
      } else {
        setResult(parsed);
      }
    } catch (e) {
      setError(`${t('error')}: ${e.message}`);
    } finally {
      setParsing(false);
      setOcrStatus('');
    }
  }

  const newTxs = result?.positions.map(pos => ({
    id: genId(),
    type: 'BUY',
    symbol: pos.symbol,
    qty: pos.qty,
    price: pos.price,
    currency: pos.currency,
    date: result.statementDate,
    note: `Snapshot ${result.statementDate}`,
    fromSnapshot: true,
  })) ?? [];

  async function handleImport() {
    if (!newTxs.length) return;
    setSaving(true); setError('');
    try {
      await onSave(newTxs);
      setSaved(true);
    } catch (e) {
      setError(e.message ?? t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  const fmtQty = q => (q % 1 === 0 ? q : q.toFixed(5));

  return (
    <Modal
      size="lg"
      title={t('si_title')}
      description={t('si_desc')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{saved ? t('close_btn') : t('cancel_btn')}</Button>
          {!saved && result && (
            <Button variant="primary" icon={Upload} loading={saving} disabled={newTxs.length === 0} onClick={handleImport}>
              {t('ci_import_n').replace('{n}', newTxs.length)}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-3">
        <FileDrop
          accept=".pdf,.png,.jpg,.jpeg"
          onFiles={files => handleFile(files[0])}
          buttonLabel={t('imp_choose_file')}
          hint={t('si_hint')}
          busy={parsing}
          busyLabel={ocrStatus || t('si_parsing')}
          compact={!!result}
        />

        {result && (
          <div className="grid gap-2">
            <p className="flex items-center gap-1.5 text-small font-semibold text-dim">
              <CircleCheck size={15} aria-hidden className="text-up" />
              {t('si_found').replace('{n}', result.positions.length)} · {result.currency} · {result.statementDate}
            </p>
            <div className="max-h-60 overflow-y-auto rounded-card-sm border border-line">
              <Table
                columns={[
                  { key: 'symbol', header: t('col_symbol'), mobile: 'title', render: p => <span className="font-mono font-bold text-fg">{p.symbol}</span> },
                  { key: 'qty', header: t('col_qty'), align: 'right', render: p => fmtQty(p.qty) },
                  { key: 'price', header: t('col_price'), align: 'right', render: p => p.price.toFixed(2) },
                  { key: 'value', header: t('col_value'), align: 'right', mobile: 'aside', render: p => `${p.value.toFixed(2)} ${p.currency}` },
                ]}
                rows={result.positions}
                rowKey={p => p.symbol}
              />
            </div>
          </div>
        )}

        {saved && <Callout tone="up" icon={CircleCheck}>{t('si_imported').replace('{n}', newTxs.length)}</Callout>}
        {error && <p role="alert" className="text-small text-down">{error}</p>}
      </div>
    </Modal>
  );
}
