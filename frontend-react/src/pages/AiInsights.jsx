import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, ChevronDown, ClipboardList, Compass, Languages, Pencil, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import PortfolioReview from '../components/PortfolioReview';
import ConfirmModal from '../components/ConfirmModal';
import TickerLogo from '../components/shared/TickerLogo';
import { Badge, Button, Callout, Card, EmptyState, IconButton, PageHeader, Skeleton, Spinner, Tabs, TabPanel } from '../components/ui';
import { cx } from '../components/ui/cx.js';
import { authHeader } from '../utils/auth.js';
import { lsSet } from '../utils/safeStorage.js';

const MANUAL_KEY = 'myfund_manual_insights';

function loadManual() {
  try {
    const raw = JSON.parse(localStorage.getItem(MANUAL_KEY) || '{}');
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      out[k] = typeof v === 'string' ? { text: v, savedAt: null } : v;
    }
    return out;
  } catch { return {}; }
}

function saveManual(data) {
  lsSet(MANUAL_KEY, JSON.stringify(data));
}

async function apiLoadInsights() {
  const r = await fetch('/api/insights', { headers: authHeader(), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const raw = await r.json();
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = typeof v === 'string' ? { text: v, savedAt: null } : v;
  }
  return out;
}

async function apiSaveInsights(data) {
  await fetch('/api/insights', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(8000),
  });
}

function fmtTime(iso, locale) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function fmtDate(iso, locale) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return ''; }
}

async function translateChunk(text) {
  const params = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: 'pl', dt: 't', q: text });
  const res = await fetch(
    `https://translate.googleapis.com/translate_a/single?${params}`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data[0].map(seg => seg[0]).join('');
}

async function translateText(text) {
  const CHUNK = 4000;
  if (text.length <= CHUNK) return translateChunk(text);
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let cur = '';
  for (const p of paragraphs) {
    const next = cur ? `${cur}\n\n${p}` : p;
    if (next.length > CHUNK && cur) { chunks.push(cur); cur = p; }
    else cur = next;
  }
  if (cur) chunks.push(cur);
  const results = [];
  for (const chunk of chunks) {
    results.push(await translateChunk(chunk));
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 300));
  }
  return results.join('\n\n');
}

function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function AiInsights() {
  const { portfolio, activePortfolio } = useApp();
  const t = useT();
  const { locale } = useLanguage();
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [manual, setManual]       = useState(loadManual);
  const [activeTab, setActiveTab] = useState('ai');
  const [editingNew, setEditingNew] = useState(null);

  const allSymbols = [...new Set(portfolio.map(p => p.symbol).filter(Boolean))];
  const waSymbols  = allSymbols.filter(s => s.endsWith('.WA'));

  const filledSymbols = allSymbols
    .filter(s => manual[s]?.text)
    .sort((a, b) => (manual[b]?.savedAt || '').localeCompare(manual[a]?.savedAt || ''));
  const emptySymbols = allSymbols
    .filter(s => !manual[s]?.text)
    .sort((a, b) => a.localeCompare(b));
  const emptyListSymbols = emptySymbols.filter(s => s !== editingNew);

  useEffect(() => {
    apiLoadInsights()
      .then(serverData => {
        if (!Object.keys(serverData).length) return;
        setManual(prev => {
          const merged = { ...prev, ...serverData };
          saveManual(merged);
          return merged;
        });
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!allSymbols.length) return;
    setLoading(true); setError(null);
    try {
      const base = import.meta.env.VITE_API_URL ?? '';
      const usSymbols = allSymbols.filter(s => !s.endsWith('.WA'));

      const [espiResult, ...usSummaries] = await Promise.all([
        waSymbols.length
          ? fetch(`${base}/api/espi-digest?symbols=${encodeURIComponent(waSymbols.join(','))}`, {
              headers: authHeader(), signal: AbortSignal.timeout(90000),
            }).then(r => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(null),
        ...usSymbols.map(sym =>
          fetch(`${base}/api/financials/summary?symbol=${encodeURIComponent(sym)}`, {
            headers: authHeader(), signal: AbortSignal.timeout(30000),
          }).then(r => r.ok ? r.json() : null).catch(() => null).then(j => ({
            symbol: sym,
            summary: j?.summary || null,
            headlines: [],
          }))
        ),
      ]);

      const waItems = espiResult?.items || waSymbols.map(s => ({ symbol: s, summary: null, headlines: [] }));
      setData({
        generatedAt: new Date().toISOString(),
        items: [...waItems, ...usSummaries],
      });
    } catch (e) {
      setError(e.message || t('error'));
    } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSymbols.join(',')]);

  useEffect(() => { load(); }, [load]);

  function handleSave(symbol, text) {
    const updated = { ...manual, [symbol]: { text, savedAt: new Date().toISOString() } };
    setManual(updated);
    saveManual(updated);
    apiSaveInsights(updated).catch(() => {});
    if (editingNew === symbol) setEditingNew(null);
  }

  function handleDelete(symbol) {
    const updated = { ...manual };
    delete updated[symbol];
    setManual(updated);
    saveManual(updated);
    apiSaveInsights(updated).catch(() => {});
  }

  const title = activePortfolio ? `${t('ai_title_prefix')} ${activePortfolio.name}` : t('ai_title_all');

  if (!allSymbols.length) {
    return (
      <>
        <PageHeader title={title} />
        <EmptyState icon={Bot} title={t('ai_no_stocks')} description={t('ai_no_stocks_hint')} />
      </>
    );
  }

  const progress = Math.round(filledSymbols.length / allSymbols.length * 100);
  const subtitle = activeTab === 'manual'
    ? t('ai_filled_count').replace('{n}', filledSymbols.length).replace('{total}', allSymbols.length)
    : activeTab === 'review'
      ? t('review_subtitle')
      : `${t('ai_companies_count').replace('{n}', allSymbols.length)}${data?.generatedAt ? ` · ${t('ai_generated_at')} ${fmtTime(data.generatedAt, locale)}` : ''}`;

  return (
    <div className="space-y-4">
      <PageHeader
        className="mb-0"
        title={title}
        subtitle={subtitle}
        actions={activeTab === 'ai' && (
          <Button variant="primary" icon={RefreshCw} loading={loading} onClick={() => { setData(null); load(); }}>
            {loading ? t('ai_generating') : t('ai_refresh')}
          </Button>
        )}
      />
      <Tabs
        id="ai"
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: 'review', label: t('ai_tab_review'), icon: Compass },
          { value: 'ai', label: t('ai_tab_ai'), icon: Bot },
          { value: 'manual', label: t('ai_tab_manual'), icon: ClipboardList },
        ]}
      />

      <TabPanel tabsId="ai" value={activeTab}>
        {activeTab === 'review' && <PortfolioReview />}

        {activeTab === 'ai' && (
          <div className="space-y-3">
            {error && <Callout tone="down" icon={TriangleAlert}>{t('ai_error_prefix')} {error}</Callout>}
            {loading && !data && allSymbols.map(sym => (
              <Card key={sym}>
                <div className="flex items-center gap-3 p-4">
                  <Skeleton className="h-10 w-10" />
                  <span className="flex items-center gap-2.5 text-small text-faint"><Spinner size="sm" /> {sym} · {t('ai_generating_summary')}</span>
                </div>
              </Card>
            ))}
            {data?.items?.map(item => <AiInsightCard key={item.symbol} item={item} />)}
          </div>
        )}

        {activeTab === 'manual' && (
          <div className="space-y-3">
            <Card>
              <div className="grid gap-2 p-4">
                <div className="flex justify-between text-small">
                  <span className="text-dim">{t('ai_coverage')}</span>
                  <span className={cx('font-bold', progress === 100 ? 'text-up' : 'text-accent-text')}>{filledSymbols.length}/{allSymbols.length}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={t('ai_coverage')}>
                  <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-[11px] leading-relaxed text-faint">{t('ai_coverage_hint')}</p>
              </div>
            </Card>

            {filledSymbols.map(sym => (
              <ManualCard key={sym} symbol={sym} entry={manual[sym]} onSave={text => handleSave(sym, text)} onDelete={() => handleDelete(sym)} />
            ))}

            {editingNew && (
              <ManualCard
                key={'editing-' + editingNew}
                symbol={editingNew}
                entry={null}
                defaultEditing
                onSave={text => handleSave(editingNew, text)}
                onDelete={() => {}}
                onCancel={() => setEditingNew(null)}
              />
            )}

            {emptyListSymbols.length > 0 && (
              <Card title={`${t('ai_to_fill')} (${emptyListSymbols.length})`}>
                <ul className="divide-y divide-line">
                  {emptyListSymbols.map(sym => (
                    <li key={sym} className="flex items-center gap-3 px-4 py-2.5">
                      <TickerLogo symbol={sym} size={28} />
                      <span className="flex-1 text-small font-semibold text-dim">{sym}</span>
                      <Button size="sm" icon={Plus} onClick={() => setEditingNew(sym)}>{t('ai_add_analysis')}</Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </TabPanel>

      <p className="text-[11px] text-faint">{t('ai_disclaimer')}</p>
    </div>
  );
}

// ─── highlighting ────────────────────────────────────────────────────────────

const HL_PATTERNS = [
  // PLN prefix: PLN 8.44 billion, PLN 39.98
  { re: /\bPLN\s[\d.,]+(?:\s(?:billion|million|thousand|mld|mln|tys\.))?/gi, s: 'bold' },
  // Number + PLN/zł suffix: 225.9 PLN, 442.7 million zloty
  { re: /\b[\d.,]+(?:\s(?:billion|million|mld|mln))?\sPLN\b/gi, s: 'bold' },
  { re: /\b[\d.,]+(?:\s(?:billion|million|mld|mln))?\szł\b/gi, s: 'bold' },
  // Scale + currency suffix: 931.8 million zloty, 2.80 mld PLN
  { re: /\b[\d.,]+\s(?:mld|mln|tys\.)\s(?:PLN|USD|EUR|GBP)\b/gi, s: 'bold' },
  // Generic X billion/million + optional currency
  { re: /\b\d+(?:[.,]\d+)?\sbillion\b(?:\s(?:zloty|dollars?|euros?|pounds?))?\b/gi, s: 'bold' },
  { re: /\b\d+(?:[.,]\d+)?\smillion\b(?:\s(?:zloty|dollars?|euros?|pounds?))?\b/gi, s: 'bold' },
  // $ prefix: $322 billion, $4.6 billion, $49.07
  { re: /\$[\d.,]+(?:\s(?:billion|million|trillion|bn|mn|B|M|T))?\b/g, s: 'bold' },
  // € prefix
  { re: /€[\d.,]+(?:\s(?:billion|million|trillion|bn|mn))?\b/g, s: 'bold' },
  // £ prefix
  { re: /£[\d.,]+(?:\s(?:billion|million|trillion|bn|mn))?\b/g, s: 'bold' },
  // Range percentages: 45-50%, 40-45%
  { re: /\b\d+(?:[.,]\d+)?[-–]\d+(?:[.,]\d+)?\s?%/g, s: 'bold' },
  // Regular / pp percentages
  { re: /\b-?\d+(?:[.,]\d+)?\s?(?:pp|p\.p\.)?%/g, s: 'bold' },
  // Valuation multiples: P/E, EV/EBITDA, P/B, P/S
  { re: /\b(?:P\/E|EV\/EBITDA|EV\/Revenue|P\/B|P\/S)\s+(?:of\s+|ratio\s+of\s+)?[\d.,]+/gi, s: 'bold' },
  // X/10 ratings
  { re: /\b\d+(?:[.,]\d+)?\/10\b/g, s: 'bold' },
  // Basis points
  { re: /\b\d+(?:[.,]\d+)?\s+(?:basis\s+points?|bps?)\b/gi, s: 'bold' },
  // Quarter + year: Q1 2026, Q1 FY26
  { re: /\bQ[1-4]\s+(?:FY)?\d{2,4}\b/g, s: 'bold' },
  // Fiscal year: FY26, FY2026
  { re: /\bFY\d{2,4}\b/g, s: 'bold' },
  // X million/billion entities: subscribers, customers, copies, stores
  { re: /\b\d+(?:[.,]\d+)?\s+(?:million|billion)\s+(?:funded\s+)?(?:subscribers?|customers?|users?|copies|stores?|locations?|employees?|shares?)\b/gi, s: 'bold' },
  // Polish store counts
  { re: /\b\d+(?:[.,]\d+)?\s+(?:nowych?\s+)?sklep[oó]w?\b/gi, s: 'bold' },
  // YoY / QoQ context: 36% YoY, up 67.5% year-on-year
  { re: /\b(?:up\s+)?-?\d+(?:[.,]\d+)?\s?%\s+(?:YoY|QoQ|year-on-year|quarter-on-quarter|rok\s+do\s+roku)\b/gi, s: 'bold' },
  // Analyst signals — negative (red)
  { re: /\b(?:Strong\s+Sell|Underperform|Sprzedaj|Niedow[aą]żaj)\b/gi, s: 'neg' },
  { re: /\bbearish\b/gi, s: 'neg' },
  // Analyst signals — positive (green)
  { re: /\b(?:Strong\s+Buy|Outperform|Overperform|Kupuj|Przew[aą]żaj)\b/gi, s: 'pos' },
  { re: /\bbullish\b/gi, s: 'pos' },
  // Neutral
  { re: /\b(?:Neutral|Hold|Trzymaj)\b/gi, s: 'dim' },
];

const HL_CLASS = {
  bold: 'font-bold text-fg',
  neg:  'rounded-sm bg-down-soft px-0.5 font-bold text-down',
  pos:  'rounded-sm bg-up-soft px-0.5 font-bold text-up',
  dim:  'font-semibold text-dim',
};

function renderPara(text, idx) {
  const ranges = [];
  for (const { re, s } of HL_PATTERNS) {
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
    for (const m of text.matchAll(new RegExp(re.source, flags))) {
      ranges.push({ start: m.index, end: m.index + m[0].length, s });
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const clean = [];
  let lastEnd = 0;
  for (const r of ranges) {
    if (r.start >= lastEnd) { clean.push(r); lastEnd = r.end; }
  }
  const parts = [];
  let pos = 0;
  for (const { start, end, s } of clean) {
    if (start > pos) parts.push(text.slice(pos, start));
    parts.push(<span key={start} className={HL_CLASS[s]}>{text.slice(start, end)}</span>);
    pos = end;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return <p key={idx} className="text-small leading-[1.8] text-dim">{parts}</p>;
}

function AnalysisView({ text, expanded, onToggle }) {
  const t = useT();
  const raw = text.trim();
  const hasDblNewline = /\n{2,}/.test(raw);
  const paras = hasDblNewline
    ? raw.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    : raw.split(/\n/).map(p => p.trim()).filter(Boolean);
  const PREVIEW = 5;
  const shown = expanded ? paras : paras.slice(0, PREVIEW);
  const hasMore = paras.length > PREVIEW;

  return (
    <div className="grid gap-2 border-t border-line px-4 py-3.5">
      {shown.map((p, i) => renderPara(p, i))}
      {hasMore && (
        <Button size="sm" variant="ghost" className="justify-self-start" onClick={onToggle}>
          {expanded
            ? t('ai_collapse')
            : `${t('ai_expand')} (${t('ai_more_paragraphs').replace('{n}', paras.length - PREVIEW)} ${paras.length - PREVIEW === 1 ? t('ai_paragraph') : t('ai_paragraphs')})`}
        </Button>
      )}
    </div>
  );
}

// ─── cards ───────────────────────────────────────────────────────────────────

function ManualCard({ symbol, entry, onSave, onDelete, defaultEditing = false, onCancel }) {
  const t = useT();
  const { locale } = useLanguage();
  const [editing, setEditing]         = useState(defaultEditing);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft]             = useState(entry?.text || '');
  const [expanded, setExpanded]       = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState(null);
  const taRef = useRef(null);

  useEffect(() => {
    if (editing && taRef.current) taRef.current.focus();
  }, [editing]);

  const text = entry?.text || '';
  const wc   = wordCount(text);

  async function handleTranslate() {
    if (!draft.trim() || translating) return;
    setTranslating(true);
    setTranslateError(null);
    try {
      setDraft(await translateText(draft.trim()));
    } catch (e) {
      setTranslateError(`${t('ai_translate_error')} (${e.message})`);
    } finally {
      setTranslating(false);
    }
  }

  function handleCancel() {
    setDraft(text);
    setTranslateError(null);
    if (text) { setEditing(false); }
    else { onCancel?.(); }
  }

  return (
    <Card className={cx(text && 'border-l-4 border-l-accent')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <TickerLogo symbol={symbol} size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-fg">{symbol}</div>
          <div className="text-[11px] text-faint">
            {text ? `${wc} ${t('ai_words_saved')} ${fmtDate(entry?.savedAt, locale) || '—'}` : t('ai_no_analysis')}
          </div>
        </div>
        {confirmDelete && (
          <ConfirmModal
            message={`${t('ai_delete_confirm')} ${symbol}?`}
            onConfirm={() => { setConfirmDelete(false); onDelete(); }}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
        {!editing && text && (
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" icon={Pencil} onClick={() => { setDraft(text); setEditing(true); }}>{t('ai_edit_btn')}</Button>
            <IconButton icon={Trash2} label={t('ai_delete_btn')} onClick={() => setConfirmDelete(true)} />
          </div>
        )}
      </div>

      {editing && (
        <div className="grid gap-2 border-t border-line px-4 pb-4 pt-3">
          <textarea
            ref={taRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            aria-label={symbol}
            placeholder={t('ai_paste_placeholder').replace('{symbol}', symbol)}
            className="min-h-[180px] w-full resize-y rounded-card-sm border border-line bg-panel-2 px-3 py-2.5 text-small leading-relaxed text-fg placeholder:text-faint hover:border-line-strong focus:border-accent focus:outline-none"
          />
          {translateError && <p className="text-[11px] text-down">{translateError}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="ghost" icon={Languages} loading={translating} disabled={!draft.trim()} onClick={handleTranslate}>
              {translating ? t('ai_translating') : t('ai_translate_btn')}
            </Button>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCancel}>{t('ai_cancel_btn')}</Button>
              <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={() => { if (draft.trim()) { onSave(draft.trim()); setEditing(false); } }}>
                {t('ai_save_btn')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!editing && text && (
        <AnalysisView text={text} expanded={expanded} onToggle={() => setExpanded(v => !v)} />
      )}
    </Card>
  );
}

function AiInsightCard({ item }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const n = item.headlines?.length ?? 0;

  return (
    <Card>
      <div className="flex items-start gap-3 p-4">
        <TickerLogo symbol={item.symbol} size={36} />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold text-fg">{item.symbol}</span>
            {n > 0 && <Badge>{t('ai_headlines_count').replace('{n}', n)}</Badge>}
          </div>
          {item.summary
            ? <p className="text-small leading-relaxed text-dim">{item.summary}</p>
            : <p className="text-small italic text-faint">{n === 0 ? t('ai_no_press_info') : t('ai_summary_unavailable')}</p>}
        </div>
      </div>
      {n > 0 && (
        <div className="border-t border-line">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(v => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-[11px] text-faint transition hover:bg-panel-hover hover:text-dim"
          >
            <span>{expanded ? t('ai_headlines_collapse') : t('ai_headlines_expand')} ({n})</span>
            <ChevronDown size={14} aria-hidden className={cx('transition-transform', expanded && 'rotate-180')} />
          </button>
          {expanded && (
            <ul className="grid gap-1.5 px-4 pb-4">
              {item.headlines.map((h, i) => (
                <li key={i} className="flex gap-2 text-[12px] leading-normal text-dim"><span className="shrink-0 text-faint">›</span>{h}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
