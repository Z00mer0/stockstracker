import { useState, useEffect } from 'react';
import { TriangleAlert, Upload, X } from 'lucide-react';
import { parseCsv, parseXtbExcel, mergeBySymbol } from '../utils/holdingsImport.js';
import { useT } from '../context/LanguageContext';
import { Badge, Button, FileDrop, Modal, SegmentedControl, Spinner, Table } from './ui';
import { cx } from './ui/cx.js';

// Przyklad formatu pokazywany uzytkownikowi. Naglowek idzie przez klucze
// kolumn, bo parseCsv czyta kolumny po POZYCJI, nie po nazwie (i pomija
// pierwszy wiersz heurystyka) — nazwy naglowka nie wplywaja na import,
// wiec moga byc w jezyku interfejsu.
const csvExample = t => `${t('col_symbol')},${t('col_qty')},${t('col_price')},${t('col_currency')},${t('col_date')}
AAPL,10,185.50,USD,2024-01-15
CDR.WA,100,88.20,PLN,2024-03-01`;

export default function CsvImportModal({ existingHoldings, onSave, onClose }) {
  const t = useT();
  const [text, setText]         = useState('');
  const [mode, setMode]         = useState('replace');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [fileName, setFileName] = useState('');
  const [filePreview, setFilePreview] = useState(null);
  const [invalidSymbols, setInvalidSymbols] = useState(new Set());
  const [validating, setValidating] = useState(false);

  // Active preview: file takes priority over textarea (defined early so useEffect can use it)
  const rawRows = filePreview ?? (text.trim() ? parseCsv(text) : []);
  const preview = mergeBySymbol(rawRows);
  const symbolsKey = preview.map(p => p.symbol).sort().join(',');

  useEffect(() => {
    if (!preview.length) { setInvalidSymbols(new Set()); return; }
    setValidating(true);
    Promise.allSettled(
      preview.map(async ({ symbol }) => {
        try {
          const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(8000) });
          if (res.status === 404) return symbol;
          if (!res.ok) return null;
          const json = await res.json();
          if (json.stooq) return null; // stooq fallback means price found
          const q = json?.quoteResponse?.result?.[0];
          return q?.regularMarketPrice ? null : symbol;
        } catch { return null; }
      })
    ).then(results => {
      const invalid = new Set(
        results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
      );
      setInvalidSymbols(invalid);
      setValidating(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  function handleFile(file) {
    setError(''); setFileName(file.name);
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xls') {
      setError(t('ci_xls_unsupported')); return;
    }
    if (ext !== 'xlsx') { setError(t('ci_must_be_xlsx')); return; }
    parseXtbExcel(file)
      .then(parsed => {
        if (!parsed.length) setError(t('ci_no_positions'));
        setFilePreview(parsed);
      })
      .catch(err => setError(`${t('bi_read_failed')}: ${err.message}`));
  }

  async function handleImport() {
    if (!preview.length) { setError(t('ci_empty')); return; }
    setSaving(true); setError('');
    try {
      let newHoldings;
      if (mode === 'replace') {
        newHoldings = preview;
      } else {
        const map = Object.fromEntries(existingHoldings.map(h => [h.symbol, h]));
        preview.forEach(p => { map[p.symbol] = p; });
        newHoldings = Object.values(map);
      }
      await onSave(newHoldings, rawRows);
      onClose();
    } catch (e) {
      setError(e.message || t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  const fmtQty = q => (q % 1 === 0 ? q : q.toFixed(4));

  return (
    <Modal
      size="lg"
      title={t('ci_title')}
      description={`${t('ci_drop_xtb_pre')} (Open Position) ${t('ci_drop_xtb_post')}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel_btn')}</Button>
          <Button variant="primary" icon={Upload} loading={saving} disabled={!preview.length} onClick={handleImport}>
            {t('ci_import_n').replace('{n}', preview.length)}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <FileDrop
          compact
          accept=".xlsx"
          onFiles={files => handleFile(files[0])}
          buttonLabel={t('imp_choose_file')}
          hint={t('ci_xlsx_hint')}
          fileName={fileName}
        />
        {filePreview && (
          <Button size="sm" variant="ghost" icon={X} className="justify-self-start" onClick={() => { setFilePreview(null); setFileName(''); setError(''); }}>
            {t('ci_remove_file')}
          </Button>
        )}

        {!filePreview && (
          <>
            <div className="flex items-center gap-2.5 text-[11px] text-faint">
              <span className="h-px flex-1 bg-line" />{t('ci_or_paste_csv_short')}<span className="h-px flex-1 bg-line" />
            </div>
            <pre className="overflow-x-auto rounded-card-sm bg-panel-2 px-3 py-2 font-mono text-[11px] text-faint">{csvExample(t)}</pre>
            <textarea
              aria-label={t('ci_paste_csv')}
              placeholder={t('ci_paste_csv')}
              value={text}
              onChange={e => { setText(e.target.value); setError(''); }}
              className="h-24 w-full resize-y rounded-card-sm border border-line bg-panel-2 px-3 py-2 font-mono text-[12px] text-fg placeholder:text-faint hover:border-line-strong focus:border-accent focus:outline-none"
            />
          </>
        )}

        <SegmentedControl
          block
          aria-label={t('ci_title')}
          options={[{ value: 'replace', label: t('ci_mode_replace') }, { value: 'merge', label: t('ci_mode_merge') }]}
          value={mode}
          onChange={setMode}
        />

        {preview.length > 0 && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2 text-small text-faint">
              {t('ci_preview_n').replace('{n}', preview.length)}
              {validating && <span className="flex items-center gap-1.5"><Spinner size="sm" />{t('ci_validating')}</span>}
              {!validating && invalidSymbols.size > 0 && <Badge tone="warn" icon={TriangleAlert}>{t('ci_unknown_n').replace('{n}', invalidSymbols.size)}</Badge>}
            </div>
            <div className="max-h-56 overflow-y-auto rounded-card-sm border border-line">
              <Table
                columns={[
                  {
                    key: 'symbol', header: t('col_symbol'), mobile: 'title',
                    render: p => (
                      <span className={cx('inline-flex items-center gap-1.5 font-semibold', invalidSymbols.has(p.symbol) ? 'text-down' : 'text-accent-text')}>
                        {p.symbol}
                        {invalidSymbols.has(p.symbol) && <TriangleAlert size={13} aria-label={t('ci_no_quote')} />}
                      </span>
                    ),
                  },
                  { key: 'qty', header: t('col_qty'), align: 'right', render: p => fmtQty(p.qty) },
                  { key: 'avgPrice', header: t('col_price'), align: 'right', mobile: 'aside', render: p => `${p.avgPrice.toFixed(2)} ${p.currency}` },
                  { key: 'date', header: t('col_date'), align: 'right', render: p => <span className="text-faint">{p.date}</span> },
                ]}
                rows={preview}
                rowKey={p => p.symbol}
              />
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-small text-down">{error}</p>}
      </div>
    </Modal>
  );
}
