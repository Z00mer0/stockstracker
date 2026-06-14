# AI Fundamental Analysis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a streaming AI-powered equity research report to the bottom of `FinancialsTab`, generated free via Groq API (llama-3.3-70b), cached per stock+period in the database.

**Architecture:** New backend endpoint `POST /api/analyze` calls Groq with existing financial JSON data and streams the response as SSE. Frontend reads the stream with `fetch` + `ReadableStream`, renders markdown inline. Cache in new DB table `financial_analyses (symbol, period, analysis_text, created_at)` — TTL 7 days.

**Tech Stack:** Python (server.py raw HTTP), React (FinancialsTab.jsx), Groq HTTP API (llama-3.3-70b-versatile), SSE streaming, PostgreSQL cache.

---

## Data Contract

Backend `/api/financials` already returns this schema (used as input to Groq):

```json
{
  "periods": [
    {
      "label": "2024", "date": "2024-12-31",
      "revenue": 1000000000, "revenueGrowthYoY": 0.15,
      "grossProfit": 600000000, "grossMargin": 0.60,
      "operatingIncome": 300000000,
      "ebitda": 350000000, "ebitdaMargin": 0.35,
      "netIncome": 200000000,
      "netDebt": -100000000,
      "totalAssets": 2000000000, "totalLiabilities": 800000000,
      "equity": 1200000000, "cashAndEquivalents": 500000000, "totalDebt": 400000000,
      "operatingCashFlow": 280000000, "capex": -80000000, "fcf": 200000000,
      "shareRepurchases": null
    }
  ],
  "valuation": {
    "peRatio": 25, "forwardPE": 22, "evEbitda": 18, "ps": 5,
    "marketCap": 5000000000, "ev": 5300000000, "pfcf": 25, "netDebtLatest": -100000000
  },
  "currency": "PLN",
  "period": "annual"
}
```

---

## Groq Prompt (system + user)

**System:**
```
Jesteś profesjonalnym analitykiem giełdowym (Equity Research Analyst). Przeprowadzasz rygorystyczną analizę fundamentalną spółki na podstawie danych finansowych. Bądź krytyczny, szukaj anomalii, unikaj ogólników. Skup się wyłącznie na liczbach, trendach i faktach. Odpowiadaj wyłącznie w języku polskim. Używaj profesjonalnego słownictwa finansowego. Formatuj odpowiedź w Markdownie.
```

**User:**
```
Dane finansowe spółki {symbol} (dane {period}, waluta: {currency}):

{financial_json}

Wygeneruj raport według struktury:

### 1. TEZA INWESTYCYJNA I FOSA (Moat)
### 2. ANALIZA PRZYCHODÓW I MARŻ
### 3. ZDROWIE BILANSU I ZADŁUŻENIE
### 4. JAKOŚĆ RUCHÓW GOTÓWKOWYCH
### 5. WYCENA I CZERWONE FLAGI
```

---

## Backend Changes (`server.py`)

### DB table

New table in `_init_db()`:
```sql
CREATE TABLE IF NOT EXISTS financial_analyses (
    symbol      TEXT NOT NULL,
    period      TEXT NOT NULL,
    analysis    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (symbol, period)
)
```

### New endpoint `POST /api/analyze`

Path: `/api/analyze`
Auth: required (`X-Auth-Token`)
Body JSON: `{ "symbol": "CDR.WA", "period": "annual" }`

**Logic:**
1. Validate symbol (regex `[A-Z0-9.\-]{1,15}`) and period (`annual|quarterly`)
2. Check DB cache: if `financial_analyses` row exists and `created_at > NOW() - INTERVAL '7 days'` → stream cached text (simulate SSE)
3. Fetch financial data: query existing `financials` table for `(symbol, period)` row, parse `data_json`
4. If no financial data → return `404 {"error": "no_financials"}`
5. Check `GROQ_API_KEY` env var → if missing return `503 {"error": "GROQ_API_KEY not configured"}`
6. Open SSE response:
   ```python
   self.send_response(200)
   self.send_header('Content-Type', 'text/event-stream')
   self.send_header('Cache-Control', 'no-cache')
   self.send_header('X-Accel-Buffering', 'no')
   self.end_headers()
   ```
7. Call Groq HTTP API with streaming (`stream: true`), model `llama-3.3-70b-versatile`, max_tokens 2000
8. For each chunk: write `data: {json.dumps({"text": chunk})}\n\n` to `self.wfile`, flush
9. On completion: write `data: [DONE]\n\n`, flush
10. Save full accumulated text to `financial_analyses` DB table (upsert)

**Groq HTTP call** (direct urllib, no library needed — matches existing pattern in server.py):
```python
url = 'https://api.groq.com/openai/v1/chat/completions'
body = json.dumps({
    "model": "llama-3.3-70b-versatile",
    "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}],
    "max_tokens": 2000,
    "stream": True
}).encode()
req = urllib.request.Request(url, data=body, headers={
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
})
with urllib.request.urlopen(req, timeout=60) as resp:
    for line in resp:
        line = line.decode().strip()
        if line.startswith('data: ') and line != 'data: [DONE]':
            chunk_data = json.loads(line[6:])
            text = chunk_data['choices'][0]['delta'].get('content', '')
            if text:
                self.wfile.write(f'data: {json.dumps({"text": text})}\n\n'.encode())
                self.wfile.flush()
```

**Streaming from cache** (simulate SSE for cached text — stream in 50-char chunks with no delay):
```python
for i in range(0, len(cached_text), 50):
    chunk = cached_text[i:i+50]
    self.wfile.write(f'data: {json.dumps({"text": chunk})}\n\n'.encode())
    self.wfile.flush()
self.wfile.write(b'data: [DONE]\n\n')
self.wfile.flush()
```

---

## Frontend Changes (`FinancialsTab.jsx`)

### New state

```jsx
const [analysis, setAnalysis]         = useState('');
const [analysisLoading, setAnalysisLoading] = useState(false);
const [analysisError, setAnalysisError]   = useState('');
const [analysisLoaded, setAnalysisLoaded] = useState(false);
```

Reset analysis when `symbol` or `period` changes:
```jsx
useEffect(() => {
  setAnalysis('');
  setAnalysisLoaded(false);
  setAnalysisError('');
}, [symbol, period]);
```

### `generateAnalysis()` function

```jsx
async function generateAnalysis() {
  setAnalysisLoading(true);
  setAnalysis('');
  setAnalysisError('');
  const token = localStorage.getItem(AUTH_KEY) || '';
  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify({ symbol, period }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Błąd generowania analizy');
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6);
          if (payload === '[DONE]') { setAnalysisLoaded(true); break; }
          const { text } = JSON.parse(payload);
          setAnalysis(prev => prev + text);
        }
      }
    }
    setAnalysisLoaded(true);
  } catch (e) {
    setAnalysisError(e.message);
  } finally {
    setAnalysisLoading(false);
  }
}
```

### Simple markdown renderer

```jsx
function renderMarkdown(text) {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br/>');
}
```

Render via `<div dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis) }} />`.

### UI section (at bottom of FinancialsTab, after existing content)

```jsx
<div style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
    <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
      🧠 {t('ai_analysis_title')}
    </h3>
    {(analysisLoaded || analysisError) && !analysisLoading && (
      <button onClick={generateAnalysis} style={/* small refresh button */}>
        ↻ {t('ai_analysis_refresh')}
      </button>
    )}
  </div>

  {/* Initial state */}
  {!analysis && !analysisLoading && !analysisError && (
    <button onClick={generateAnalysis} style={/* primary button */}>
      {t('ai_analysis_generate')}
    </button>
  )}

  {/* Streaming / loaded */}
  {analysis && (
    <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}
         dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis) }} />
  )}

  {/* Loading indicator (dots after last text) */}
  {analysisLoading && (
    <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>●●●</span>
  )}

  {/* Error */}
  {analysisError && !analysisLoading && (
    <p style={{ color: 'var(--down)', fontSize: 12 }}>{analysisError}</p>
  )}
</div>
```

---

## Translation keys (pl.js / en.js)

```js
// pl.js
ai_analysis_title: 'Analiza fundamentalna AI',
ai_analysis_generate: 'Generuj analizę',
ai_analysis_refresh: 'Odśwież',

// en.js
ai_analysis_title: 'AI Fundamental Analysis',
ai_analysis_generate: 'Generate analysis',
ai_analysis_refresh: 'Refresh',
```

---

## Error Cases

| Scenario | HTTP | Message shown |
|---|---|---|
| Brak GROQ_API_KEY | 503 | "Funkcja niedostępna — brak klucza GROQ" |
| Brak danych finansowych | 404 | "Brak danych finansowych dla tej spółki" |
| Groq rate limit | 429 | "Limit zapytań Groq przekroczony, spróbuj za chwilę" |
| Network error | — | "Błąd generowania analizy" |

---

## Files Modified

- `server.py` — add `financial_analyses` table + `POST /api/analyze` endpoint (~80 lines)
- `frontend-react/src/components/FinancialsTab.jsx` — add analysis section (~80 lines)
- `frontend-react/src/translations/pl.js` — 3 keys
- `frontend-react/src/translations/en.js` — 3 keys
