import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../context/LanguageContext';
import Spinner from '../components/shared/Spinner';

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
  localStorage.setItem(MANUAL_KEY, JSON.stringify(data));
}

function authHeader() {
  return { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' };
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

function fmtTime(iso, locale = 'pl-PL') {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function fmtDate(iso, locale = 'pl-PL') {
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
  if (!res.ok) throw new Error(`Blad API tlumaczenia (${res.status})`);
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
  const { portfolio } = useApp();
  const t = useT();
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [manual, setManual]       = useState(loadManual);
  const [activeTab, setActiveTab] = useState('manual');
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

  if (!allSymbols.length) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 80, color: 'var(--text-faint)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
        <p style={{ color: 'var(--text-dim)', fontWeight: 600, marginBottom: 6 }}>{t('ai_no_stocks')}</p>
        <p style={{ fontSize: 13 }}>{t('ai_no_stocks_hint')}</p>
      </div>
    );
  }

  const progress = Math.round(filledSymbols.length / allSymbols.length * 100);

  return (
    <div className="space-y-5">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            {t('ai_title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>
            {activeTab === 'manual'
              ? t('ai_filled_count').replace('{n}', filledSymbols.length).replace('{total}', allSymbols.length)
              : `${allSymbols.length} spółek${data?.generatedAt ? ` · ${t('ai_generated_at')} ${fmtTime(data.generatedAt)}` : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {[['manual', t('ai_tab_manual')], ['ai', t('ai_tab_ai')]].map(([key, label]) => (
              <button key={key} onClick={() => setActiveTab(key)} style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                background: activeTab === key ? 'var(--accent)' : 'var(--panel)',
                color: activeTab === key ? '#fff' : 'var(--text-dim)',
                border: 'none', cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
          {activeTab === 'ai' && (
            <button className="btn btn-primary" onClick={() => { setData(null); load(); }} disabled={loading} style={{ fontSize: 12 }}>
              {loading ? t('ai_generating') : t('ai_refresh')}
            </button>
          )}
        </div>
      </div>

      {activeTab === 'manual' && (
        <>
          <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--panel)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--text-dim)' }}>{t('ai_coverage')}</span>
              <span style={{ fontWeight: 700, color: progress === 100 ? 'var(--up)' : 'var(--accent)' }}>
                {filledSymbols.length}/{allSymbols.length}
              </span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'var(--panel-2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, var(--accent), #818cf8)', borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
              {t('ai_coverage_hint')}
            </p>
          </div>

          {filledSymbols.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filledSymbols.map(sym => (
                <ManualCard
                  key={sym}
                  symbol={sym}
                  entry={manual[sym]}
                  onSave={text => handleSave(sym, text)}
                  onDelete={() => handleDelete(sym)}
                />
              ))}
            </div>
          )}

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
            <div>
              {filledSymbols.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 10px' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                    {t('ai_to_fill')} ({emptyListSymbols.length})
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
              )}
              <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--panel)' }}>
                {emptyListSymbols.map((sym, i) => (
                  <div key={sym} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                    borderBottom: i < emptyListSymbols.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 6, flexShrink: 0, background: 'var(--panel-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700, color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace',
                    }}>
                      {sym.replace('.WA', '').slice(0, 4)}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>{sym}</span>
                    <button
                      onClick={() => setEditingNew(sym)}
                      style={{
                        fontSize: 11, padding: '4px 12px', borderRadius: 6, fontWeight: 600, cursor: 'pointer',
                        background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: 'var(--accent)',
                      }}
                    >
                      {t('ai_add_analysis')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'ai' && (
        <>
          {error && (
            <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--down-soft)', border: '1px solid var(--down)', color: 'var(--down)', fontSize: 13 }}>
              {t('ai_error_prefix')} {error}
            </div>
          )}
          {loading && !data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {allSymbols.map(sym => (
                <div key={sym} style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--panel-2)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-faint)', fontSize: 13 }}>
                      <Spinner size="sm" /> {t('ai_generating_summary')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {data?.items?.map(item => (
            <AiInsightCard key={item.symbol} item={item} />
          ))}
        </>
      )}

      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--panel-2)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)' }}>
        {t('ai_disclaimer')}
      </div>
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

const HL_STYLE = {
  bold: { fontWeight: 700, color: 'var(--text)' },
  neg:  { fontWeight: 700, color: 'var(--down)',  background: 'rgba(239,68,68,0.1)',  borderRadius: 3, padding: '0 3px' },
  pos:  { fontWeight: 700, color: 'var(--up)',    background: 'rgba(34,197,94,0.1)', borderRadius: 3, padding: '0 3px' },
  dim:  { fontWeight: 600, color: 'var(--text-dim)' },
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
    parts.push(<span key={start} style={HL_STYLE[s]}>{text.slice(start, end)}</span>);
    pos = end;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return (
    <p key={idx} style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.8, margin: idx > 0 ? '8px 0 0' : 0 }}>
      {parts}
    </p>
  );
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
    <div style={{ borderTop: '1px solid var(--border)', padding: '14px 20px 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {shown.map((p, i) => renderPara(p, i))}
      </div>
      {hasMore && (
        <button onClick={onToggle}
          style={{ marginTop: 12, fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {expanded
            ? t('ai_collapse')
            : `${t('ai_expand')} (${t('ai_more_paragraphs').replace('{n}', paras.length - PREVIEW)} ${paras.length - PREVIEW === 1 ? t('ai_paragraph') : t('ai_paragraphs')})`}
        </button>
      )}
    </div>
  );
}

// ─── cards ───────────────────────────────────────────────────────────────────

function ManualCard({ symbol, entry, onSave, onDelete, defaultEditing = false, onCancel }) {
  const t = useT();
  const [editing, setEditing]         = useState(defaultEditing);
  const [draft, setDraft]             = useState(entry?.text || '');
  const [expanded, setExpanded]       = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState(null);
  const taRef = useRef(null);

  useEffect(() => {
    if (editing && taRef.current) taRef.current.focus();
  }, [editing]);

  const text   = entry?.text || '';
  const ticker = symbol.replace('.WA', '');
  const wc     = wordCount(text);

  async function handleTranslate() {
    if (!draft.trim() || translating) return;
    setTranslating(true);
    setTranslateError(null);
    try {
      setDraft(await translateText(draft.trim()));
    } catch (e) {
      setTranslateError(e.message);
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
    <div style={{
      borderRadius: 12, background: 'var(--panel)', overflow: 'hidden',
      border: '1px solid var(--border)',
      borderLeft: text ? '4px solid var(--accent)' : '1px solid var(--border)',
    }}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, flexShrink: 0,
          background: text ? 'rgba(99,102,241,0.15)' : 'var(--panel-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, color: text ? 'var(--accent)' : 'var(--text-faint)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: ticker.length > 4 ? 8 : ticker.length > 3 ? 10 : 12,
          letterSpacing: '-0.5px',
        }}>
          {ticker.slice(0, 5)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>{symbol}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            {text ? `${wc} ${t('ai_words_saved')} ${fmtDate(entry?.savedAt) || '—'}` : t('ai_no_analysis')}
          </div>
        </div>
        {!editing && text && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => { setDraft(text); setEditing(true); }}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer' }}>
              {t('ai_edit_btn')}
            </button>
            <button onClick={() => { if (confirm(`Usunąć analizę dla ${symbol}?`)) onDelete(); }}
              style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'none', border: '1px solid var(--border)', color: 'var(--text-faint)', cursor: 'pointer' }}
              title="Usuń">
              🗑
            </button>
          </div>
        )}
      </div>

      {editing && (
        <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border)' }}>
          <textarea
            ref={taRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={t('ai_paste_placeholder').replace('{symbol}', symbol)}
            style={{
              width: '100%', minHeight: 180, marginTop: 12, padding: '10px 12px',
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text)', fontSize: 13, lineHeight: 1.65, resize: 'vertical',
              fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
            }}
          />
          {translateError && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--down)' }}>{translateError}</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleTranslate}
              disabled={translating || !draft.trim()}
              style={{
                fontSize: 11, padding: '5px 12px', borderRadius: 6,
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                color: 'var(--accent)', cursor: translating || !draft.trim() ? 'not-allowed' : 'pointer',
                opacity: !draft.trim() ? 0.4 : 1,
              }}
            >
              {translating ? t('ai_translating') : t('ai_translate_btn')}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCancel}
                style={{ fontSize: 12, padding: '5px 14px', borderRadius: 6, background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer' }}>
                {t('ai_cancel_btn')}
              </button>
              <button
                onClick={() => { if (draft.trim()) { onSave(draft.trim()); setEditing(false); } }}
                disabled={!draft.trim()}
                style={{
                  fontSize: 12, padding: '5px 14px', borderRadius: 6, background: 'var(--accent)', border: 'none',
                  color: '#fff', cursor: draft.trim() ? 'pointer' : 'not-allowed', fontWeight: 600,
                  opacity: draft.trim() ? 1 : 0.5,
                }}>
                {t('ai_save_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {!editing && text && (
        <AnalysisView text={text} expanded={expanded} onToggle={() => setExpanded(v => !v)} />
      )}
    </div>
  );
}

function AiInsightCard({ item }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const ticker = item.symbol.replace('.WA', '').slice(0, 4);

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, flexShrink: 0,
          background: item.summary ? 'rgba(99,102,241,0.15)' : 'var(--panel-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace',
        }}>
          {ticker}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{item.symbol}</span>
            {item.headlines?.length > 0 && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--panel-2)', color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
                {item.headlines.length} informacji
              </span>
            )}
          </div>
          {item.summary
            ? <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.65, margin: 0 }}>{item.summary}</p>
            : <p style={{ fontSize: 13, color: 'var(--text-faint)', fontStyle: 'italic', margin: 0 }}>
                {item.headlines?.length === 0 ? t('ai_no_press_info') : t('ai_summary_unavailable')}
              </p>
          }
        </div>
      </div>
      {item.headlines?.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ width: '100%', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-faint)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--panel-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span>{expanded ? t('ai_headlines_collapse') : t('ai_headlines_expand')} ({item.headlines.length})</span>
            <span style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
          </button>
          {expanded && (
            <div style={{ padding: '0 20px 16px' }}>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {item.headlines.map((h, i) => (
                  <li key={i} style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>›</span>{h}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
