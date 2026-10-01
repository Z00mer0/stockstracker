import { useEffect, useState } from 'react';
import { CircleCheck, FileText, Info, Upload } from 'lucide-react';
import { dedupeBatch, dedupeAgainstExisting } from '../utils/brokerDedupe';
import { parseBrokerCsv, parseBrokerXlsx, computePortfolioPreview } from '../utils/brokerImport.js';
import { useApp } from '../context/AppContext';
import { useT } from '../context/LanguageContext';
import { Button, Callout, Field, FileDrop, Modal, Select } from './ui';

export default function BrokerImportModal({ existingTransactions, existingPortfolio = [], existingCash = {}, onSave, onClose }) {
  const t = useT();
  const [results, setResults] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  // Import zapisuje do AKTYWNEGO portfela — widok "Wszystkie" nie jest
  // prawidłowym celem zapisu, więc wymuszamy wybór konkretnego portfela.
  const { portfolios, activePortfolioId, switchPortfolio, loading } = useApp();
  const accountCurrency = portfolios.find(p => p.id === activePortfolioId)?.currency;
  const isAggregate = activePortfolioId === 'all';

  // Pliki zostają w stanie i są czytane od nowa po zmianie portfela
  // docelowego — waluta wpłat zależy od waluty rachunku.
  const [files, setFiles] = useState([]);
  function handleFiles(picked) {
    setError(''); setSaved(false);
    setFiles(picked);
  }

  useEffect(() => {
    if (!files.length) return;
    let cancelled = false;
    const readers = files.flatMap(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'xls') {
        // Stary, binarny format Excela. Czytała go tylko biblioteka, którą
        // wymieniliśmy z powodu podatności — lepiej powiedzieć wprost niż
        // pozwolić, żeby import po cichu nic nie znalazł.
        return [Promise.resolve([{ name: file.name, type: 'unknown', transactions: [], errors: [],
          error: 'bi_xls_unsupported' }])];
      }
      if (ext === 'xlsx') {
        return [parseBrokerXlsx(file, accountCurrency)
          .then(rs => rs.map(r => ({ name: `${file.name} [${r.sheetName ?? ''}]`, ...r })))
          .catch(err => [{ name: file.name, type: 'unknown', transactions: [], errors: [],
            error: 'bi_read_failed', errorDetail: err.message }])];
      }
      {
        return [new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = e => resolve([{ name: file.name, ...parseBrokerCsv(e.target.result, accountCurrency) }]);
          reader.readAsText(file, 'utf-8');
        })];
      }
    });
    Promise.all(readers).then(groups => { if (!cancelled) setResults(groups.flat()); });
    return () => { cancelled = true; };
  }, [files, accountCurrency]);

  // Intra-batch dedup: when both sheets are uploaded, same trade appears in both.
  // Multiset semantics — kilka identycznych transakcji w JEDNYM arkuszu to nie
  // duplikaty (patrz utils/brokerDedupe.js).
  const allNewTxs = dedupeBatch(results.map(r => r.transactions));
  const deduped = dedupeAgainstExisting(allNewTxs, existingTransactions);
  // Podgląd liczony z tego, co faktycznie zostanie zapisane (deduped),
  // żeby nie pokazywał zmian, których import potem nie wykona.
  const preview = deduped.length > 0 ? computePortfolioPreview(deduped, existingPortfolio, existingCash) : null;
  const instruments = new Set(deduped.map(t => t.symbol));

  async function handleImport() {
    if (!deduped.length) return;
    setSaving(true); setError('');
    try {
      await onSave(deduped);
      setSaved(true);
    } catch (e) {
      setError(e.response?.data?.error ?? e.message ?? t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  // Parametr nazywał się `t` i przesłaniał tłumaczenie — dla nierozpoznanego
  // pliku t('bi_type_unknown') wołało napis jak funkcję i okno padało.
  const typeLabel = type =>
    type === 'closed_positions' ? 'Closed Positions' :
    type === 'cash_operations'  ? 'Cash Operations'  : t('bi_type_unknown');
  const fmtQty = q => (q % 1 === 0 ? q : q.toFixed(4));

  return (
    <Modal
      size="lg"
      title={t('bi_title')}
      description={`${t('bi_supports_pre')} CSV ${t('bi_supports_and')} XLSX${t('bi_supports_post')}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{saved ? t('close_btn') : t('cancel_btn')}</Button>
          {!saved && (
            <Button
              variant="primary" icon={Upload} loading={saving}
              onClick={handleImport}
              disabled={deduped.length === 0 || isAggregate || loading}
              title={isAggregate ? t('bi_pick_portfolio') : undefined}
            >
              {loading ? t('bi_loading_portfolio') : t('ci_import_n').replace('{n}', deduped.length)}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-3">
        <FileDrop
          accept=".csv,.xlsx"
          multiple
          onFiles={handleFiles}
          buttonLabel={t('imp_choose_files')}
          hint={t('bi_accepted_formats')}
          compact={results.length > 0}
        />

        {results.map((r, i) => (
          <div key={i} className="grid gap-0.5 rounded-card-sm border border-line bg-panel-2 px-3 py-2.5 text-[12px]">
            <p className="flex items-center gap-1.5 truncate font-semibold text-dim"><FileText size={13} aria-hidden className="shrink-0" /><span className="truncate">{r.name}</span></p>
            <p className="text-faint">{t('bi_type_label')} <span className="text-dim">{typeLabel(r.type)}</span></p>
            <p className="text-faint">{t('bi_found_tx')} <span className="text-dim">{r.transactions.length}</span></p>
            {r.error && <p className="text-down">{t(r.error)}{r.errorDetail ? `: ${r.errorDetail}` : ''}</p>}
            {r.errors?.length > 0 && <p className="text-warn">{t('bi_errors_n').replace('{n}', r.errors.length)}</p>}
          </div>
        ))}

        {results.length > 0 && (
          <Field label={t('bi_target')} error={isAggregate ? t('bi_pick_specific_portfolio') : undefined}>
            <Select value={isAggregate ? '' : activePortfolioId} onChange={e => e.target.value && switchPortfolio(e.target.value)}>
              <option value="" disabled>{t('bi_pick_placeholder')}</option>
              {portfolios.map(p => <option key={p.id} value={p.id}>{p.name} ({p.currency})</option>)}
            </Select>
          </Field>
        )}

        {results.length > 0 && (
          <Callout tone={deduped.length > 0 ? 'up' : 'info'} icon={deduped.length > 0 ? CircleCheck : Info}>
            {deduped.length > 0
              ? t('bi_new_n').replace('{n}', deduped.length).replace('{m}', instruments.size)
              : t('bi_all_duplicates')}
            {(allNewTxs.length - deduped.length) > 0 && (
              <span className="block text-[11px] text-faint">{t('bi_dupes_n').replace('{n}', allNewTxs.length - deduped.length)}</span>
            )}
          </Callout>
        )}

        {preview && (() => {
          const { added, removed, modified, cashAdded, cashRemoved = {} } = preview;
          const hasChanges = added.length + removed.length + modified.length
            + Object.keys(cashAdded).length + Object.keys(cashRemoved).length > 0;
          return (
            <div className="grid gap-1 rounded-card-sm border border-line bg-panel-2 px-3 py-2.5 text-[12px] tabular-nums">
              <p className="text-label font-semibold uppercase text-dim">{t('bi_preview_changes')}</p>
              {!hasChanges && <p className="text-faint">{t('bi_closed_only_history')}</p>}
              {added.map(x => (
                <p key={x.symbol} className="text-up">+ {x.symbol} {fmtQty(x.qty)} {t('bi_pcs_at')} {x.avgPrice?.toFixed(2)} {x.currency}</p>
              ))}
              {modified.map(x => (
                <p key={x.symbol} className="text-dim">~ {x.symbol}: {fmtQty(x.oldQty)} → {fmtQty(x.qty)}</p>
              ))}
              {removed.map(x => (
                <p key={x.symbol} className="text-down">− {x.symbol} ({t('bi_position_closed')})</p>
              ))}
              {Object.entries(cashAdded).map(([cur, v]) => (
                <p key={'add_' + cur} className="text-up">{t('bi_cash')} +{v.toFixed(2)} {cur}</p>
              ))}
              {Object.entries(cashRemoved).map(([cur, v]) => (
                <p key={'rm_' + cur} className="text-down">{t('bi_cash')} −{v.toFixed(2)} {cur}</p>
              ))}
            </div>
          );
        })()}

        {saved && <Callout tone="up" icon={CircleCheck}>{t('bi_imported_ok')}</Callout>}
        {error && <p role="alert" className="text-small text-down">{error}</p>}
      </div>
    </Modal>
  );
}
