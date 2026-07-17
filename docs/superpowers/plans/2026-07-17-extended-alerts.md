# Rozszerzone typy alertów — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trzy nowe typy alertów push: zmiana dzienna ±X% (per-spółka), 52-tygodniowe max/min (per-spółka), spadek portfela od ATH (per-użytkownik).

**Architecture:** Alerty per-spółka rozszerzają istniejący obiekt alertu w `user_watchlist.items_json` o pole `kind` (brak = `price`, wstecznie zgodne). Alert portfelowy dostaje własną tabelę `portfolio_alerts` i serwerową wycenę akcje+gotówka. Dane (changePct, 52W) pochodzą z tego samego zapytania Yahoo, które już robi `api/quotes.js` — trzeba je tylko przepuścić.

**Tech Stack:** Python stdlib HTTPServer (server.py), React+Vite (frontend-react), Vercel serverless (api/quotes.js), Postgres (Neon), Web Push (pywebpush), cron przez GitHub Actions.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-extended-alerts-design.md` — przeczytaj przed swoim taskiem.
- Repo jest PUBLICZNE — żadnych sekretów w plikach.
- Baza lokalna = PRODUKCYJNA (Neon) — żadnego destrukcyjnego SQL; `CREATE TABLE IF NOT EXISTS` jest OK.
- Commity: `git -c user.name="Z00mer0" -c user.email="gorski.a.r@gmail.com" commit …`; ZERO wzmianek o Claude (patrz CLAUDE.md §5).
- NIE pushuj do origin — push robi sesja główna po review całości.
- Stare alerty (bez pola `kind`) muszą działać bez migracji jako `kind='price'`.
- Serwer jest jednowątkowy — każde wyjście w sieć z timeoutem.
- Brak frameworka testów — weryfikacja przez `python3 -m py_compile`, skrypty ad-hoc i `npm run build`.

---

### Task 1: quotes.js — przepuść 52W high/low

**Files:**
- Modify: `api/quotes.js` (ścieżka sukcesu Yahoo, ~linie 29-37)
- Modify: `frontend-react/api/quotes.js` (identyczna kopia — ta sama zmiana)

**Interfaces:**
- Produces: odpowiedź `quoteResponse.result[0]` zawiera dodatkowo `fiftyTwoWeekHigh` i `fiftyTwoWeekLow` (number|null). Ścieżka stooq (`{stooq:true,price}`) bez zmian — konsument traktuje brak pól jako null.

- [ ] **Step 1: Zmień blok sukcesu Yahoo w `api/quotes.js`**

Obecny kod:
```js
    const prev = meta.chartPreviousClose;
    const price = meta.regularMarketPrice;
    const changePercent = prev > 0 ? ((price - prev) / prev) * 100 : null;
    return res.status(200).json({
      quoteResponse: {
        result: [{ regularMarketPrice: price, regularMarketChangePercent: changePercent }],
      },
    });
```

Nowy kod:
```js
    const prev = meta.chartPreviousClose;
    const price = meta.regularMarketPrice;
    const changePercent = prev > 0 ? ((price - prev) / prev) * 100 : null;
    return res.status(200).json({
      quoteResponse: {
        result: [{
          regularMarketPrice: price,
          regularMarketChangePercent: changePercent,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
        }],
      },
    });
```

- [ ] **Step 2: Ta sama zmiana w `frontend-react/api/quotes.js`**

Pliki są kopiami — po edycji zweryfikuj: `diff api/quotes.js frontend-react/api/quotes.js` → brak różnic (jeśli pliki różniły się PRZED zmianą, zgłoś w raporcie i zmień oba niezależnie tylko w bloku sukcesu Yahoo).

- [ ] **Step 3: Weryfikacja składni**

Run: `node --check api/quotes.js && node --check frontend-react/api/quotes.js && echo OK`
Expected: `OK`

- [ ] **Step 4: Weryfikacja danych źródłowych (meta ma te pola)**

Run: `curl -s "https://query1.finance.yahoo.com/v8/finance/chart/PKN.WA?interval=1d&range=1d" -H "User-Agent: Mozilla/5.0" | python3 -c "import json,sys; m=json.load(sys.stdin)['chart']['result'][0]['meta']; print(m['fiftyTwoWeekHigh'], m['fiftyTwoWeekLow'])"`
Expected: dwie liczby (np. `148.68 76.54`)

- [ ] **Step 5: Commit**

```bash
git add api/quotes.js frontend-react/api/quotes.js
git -c user.name="Z00mer0" -c user.email="gorski.a.r@gmail.com" commit -m "feat(quotes): zwracaj 52-tygodniowe max/min z Yahoo meta"
```

---

### Task 2: server.py — _fetch_quote + obsługa kind w pętli alertów

**Files:**
- Modify: `server.py` — funkcja `_fetch_price_simple` (~linia 1860, pod `QUOTES_BASE`) i pętla alertów w `_run_push_checks` (~linie 2005-2060)

**Interfaces:**
- Consumes: odpowiedź quotes z Task 1 (`fiftyTwoWeekHigh/Low` — ale NIE zakładaj, że prod już je zwraca; kod musi tolerować ich brak).
- Produces: `_fetch_quote(symbol) -> dict|None` o kształcie `{'price': float, 'changePct': float|None, 'high52': float|None, 'low52': float|None}`. Task 3 używa jej do wyceny portfela. Obiekt alertu: pola `kind` (`'price'|'dailyChange'|'week52'`, brak=price), `targetPercent` (dailyChange).

- [ ] **Step 1: Zamień `_fetch_price_simple` na `_fetch_quote`**

Obecna funkcja zwraca `float|None`. Nowa (zastępuje ją w całości, w tym samym miejscu):

```python
def _fetch_quote(symbol):
    """Bieżące notowanie przez /api/quotes (Vercel) — to samo źródło co frontend.
    Zwraca {'price','changePct','high52','low52'} lub None. Pola poza price mogą
    być None (ścieżka stooq / finnhub bez 52W)."""
    try:
        url = f'{QUOTES_BASE}/api/quotes?symbols={urllib.parse.quote(symbol)}'
        req = urllib.request.Request(url, headers={'User-Agent': _YF_UA, 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        if isinstance(data, dict):
            if (data.get('price') or 0) > 0:          # ścieżka stooq: {"stooq":true,"price":N}
                return {'price': float(data['price']), 'changePct': None, 'high52': None, 'low52': None}
            res = data.get('quoteResponse', {}).get('result') or []
            if res:
                q = res[0]
                if (q.get('regularMarketPrice') or 0) > 0:
                    return {
                        'price': float(q['regularMarketPrice']),
                        'changePct': q.get('regularMarketChangePercent'),
                        'high52': q.get('fiftyTwoWeekHigh'),
                        'low52': q.get('fiftyTwoWeekLow'),
                    }
    except Exception as e:
        print(f'[push] price quotes {symbol}: {e}')
    # zapas dla US — finnhub (c=cena, dp=zmiana dzienna %)
    if not symbol.endswith('.WA'):
        try:
            token = os.environ.get('FINNHUB_TOKEN', '')
            if token:
                url = f'https://finnhub.io/api/v1/quote?symbol={symbol}&token={token}'
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=6) as r:
                    q = json.loads(r.read())
                if (q.get('c') or 0) > 0:
                    return {'price': float(q['c']), 'changePct': q.get('dp'), 'high52': None, 'low52': None}
        except Exception as e:
            print(f'[push] price finnhub {symbol}: {e}')
    return None
```

Sprawdź, że `_fetch_price_simple` nie ma innych call-site'ów: `grep -n "_fetch_price_simple" server.py` — jedyny powinien być w `_run_push_checks`. Jeśli są inne, zgłoś w raporcie zamiast zgadywać.

- [ ] **Step 2: Przepisz pętlę alertów w `_run_push_checks` na obsługę `kind`**

Obecny blok (od `for alert in item.get('alerts', []):` do `except Exception as e:` z `print(f'[push] alert {username}/{sym}: {e}')` włącznie) zamień na:

```python
                for alert in item.get('alerts', []):
                    mode = alert.get('mode') or 'once'
                    if alert.get('triggered') and mode == 'once':
                        continue
                    try:
                        if sym not in price_cache:
                            price_cache[sym] = _fetch_quote(sym)
                        quote = price_cache[sym]
                        if quote is None:
                            continue
                        price = quote['price']
                        kind = alert.get('kind') or 'price'
                        # ── warunek zadziałania per rodzaj ──
                        if kind == 'price':
                            target = alert.get('targetPrice')
                            hit = ((alert.get('type') == 'above' and price >= target) or
                                   (alert.get('type') == 'below' and price <= target))
                        elif kind == 'dailyChange':
                            chg = quote.get('changePct')
                            if chg is None:
                                continue  # brak danych w tym cyklu (stooq)
                            tp = float(alert.get('targetPercent') or 0)
                            if tp <= 0:
                                continue
                            hit = (chg >= tp) if alert.get('type') == 'above' else (chg <= -tp)
                        elif kind == 'week52':
                            bound = quote.get('high52') if alert.get('type') == 'above' else quote.get('low52')
                            if bound is None:
                                continue  # brak danych w tym cyklu
                            hit = (price >= bound) if alert.get('type') == 'above' else (price <= bound)
                        else:
                            continue
                        if mode == 'rearm' and alert.get('triggered'):
                            if not hit:  # warunek ustał — uzbrój ponownie
                                alert['triggered'] = False
                                dirty = True
                            continue
                        if not hit:
                            continue
                        if mode == 'repeat' and not _cooldown_passed(alert.get('lastSentAt')):
                            continue
                        # ── treść powiadomienia per rodzaj ──
                        cur_lbl = item.get('currency') or ''
                        if kind == 'price':
                            arrow = '↑' if alert.get('type') == 'above' else '↓'
                            title = f'🔔 {sym} {arrow} {target:g} {cur_lbl}'.strip()
                        elif kind == 'dailyChange':
                            chg = quote['changePct']
                            title = (f'📈 {sym} +{chg:.1f}% dziś' if alert.get('type') == 'above'
                                     else f'📉 {sym} {chg:.1f}% dziś')
                        else:  # week52
                            title = (f'🚀 {sym} — nowe 52-tyg. maksimum' if alert.get('type') == 'above'
                                     else f'⚓ {sym} — nowe 52-tyg. minimum')
                        body = f'Aktualna cena: {price:.2f} {cur_lbl}'.strip()
                        _send_push(username, title, body, '/watchlist')
                        if mode == 'repeat':
                            alert['lastSentAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                        else:
                            alert['triggered'] = True
                        dirty = True
                        stats['priceAlerts'] += 1
                    except Exception as e:
                        print(f'[push] alert {username}/{sym}: {e}')
```

Zachowaj wcięcia otoczenia (blok siedzi wewnątrz `for item in items:` wewnątrz `try:`).

- [ ] **Step 3: Kompilacja**

Run: `python3 -m py_compile server.py && echo OK`
Expected: `OK`

- [ ] **Step 4: Test logiki na żywych danych (bez wysyłania pushy)**

Skrypt ad-hoc (uruchom z katalogu repo):
```bash
python3 - <<'EOF'
import importlib.util
spec = importlib.util.spec_from_file_location('srv', 'server.py')
srv = importlib.util.module_from_spec(spec); spec.loader.exec_module(srv)
q = srv._fetch_quote('PKN.WA')
print('PKN.WA:', q)
assert q and q['price'] > 0, 'brak ceny'
assert q['changePct'] is not None, 'brak changePct (quotes zwraca go od dawna)'
# high52/low52 mogą być None dopóki Task 1 nie jest na produkcji — tylko wypisz
q2 = srv._fetch_quote('AAPL')
print('AAPL:', q2)
assert q2 and q2['price'] > 0
print('OK')
EOF
```
Expected: dwa dicty + `OK`. UWAGA: import server.py łączy się z produkcyjną bazą (init tabel — bezpieczne, `IF NOT EXISTS`).

- [ ] **Step 5: Commit**

```bash
git add server.py
git -c user.name="Z00mer0" -c user.email="gorski.a.r@gmail.com" commit -m "feat(push): typy alertów dailyChange i week52 w pętli push"
```

---

### Task 3: server.py — alert spadku portfela (tabela, wycena, pętla, API)

**Files:**
- Modify: `server.py` — blok init DB (po `CREATE TABLE IF NOT EXISTS push_sent`, ~linia 1215), nowa funkcja wyceny (po `_nbp_rates`, ~linia 1964), sekcja w `_run_push_checks`, routes GET (~linia 2326, po push/vapid-key) i POST (~linia 4650, po push/test)

**Interfaces:**
- Consumes: `_fetch_quote(symbol) -> dict|None` (Task 2), `_nbp_rates() -> {'USD': 3.98, ..., 'PLN': 1.0}`, `get_username(self)`, `_send_push(username, title, body, url)`, `_cooldown_passed(iso_str)`.
- Produces: tabela `portfolio_alerts`; `GET /api/portfolio-alert` → `{enabled, thresholdPct}`; `POST /api/portfolio-alert` body `{enabled: bool, thresholdPct: number}` → `{ok: true}`. Frontend (Task 5) używa dokładnie tych nazw pól.

- [ ] **Step 1: Tabela w bloku init DB**

Po bloku `CREATE TABLE IF NOT EXISTS push_sent (...)` dodaj:
```python
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_alerts (
                    username      TEXT PRIMARY KEY,
                    threshold_pct NUMERIC NOT NULL,
                    enabled       BOOLEAN DEFAULT TRUE,
                    triggered     BOOLEAN DEFAULT FALSE,
                    ath_value     NUMERIC,
                    last_sent_at  TIMESTAMPTZ
                )""")
```

- [ ] **Step 2: Funkcja wyceny (wstaw po `_nbp_rates`)**

```python
def _portfolio_market_value(username, price_cache, rates):
    """Wycena akcje+gotówka wszystkich portfeli użytkownika w PLN.
    None gdy jakakolwiek cena/kurs niedostępny — częściowa wycena dałaby fałszywy drawdown.
    Świadomie pomija obligacje i inne aktywa (patrz spec)."""
    with _conn() as c, c.cursor() as cur:
        cur.execute("""SELECT h.symbol, h.qty, h.currency FROM portfolio_holdings h
                       JOIN portfolio_list p ON p.id = h.portfolio_id
                       WHERE p.user_id = %s""", (username,))
        holdings = cur.fetchall()
        cur.execute("""SELECT pc.currency, SUM(pc.amount) FROM portfolio_cash pc
                       JOIN portfolio_list p ON p.id = pc.portfolio_id
                       WHERE p.user_id = %s GROUP BY pc.currency""", (username,))
        cash = cur.fetchall()
    total = 0.0
    for sym, qty, curr in holdings:
        if float(qty or 0) <= 0:
            continue
        if sym not in price_cache:
            price_cache[sym] = _fetch_quote(sym)
        q = price_cache[sym]
        if q is None:
            return None
        fx = rates.get(curr or 'PLN')
        if fx is None:
            return None
        total += float(qty) * q['price'] * fx
    for curr, amount in cash:
        fx = rates.get(curr or 'PLN')
        if fx is None:
            return None
        total += float(amount or 0) * fx
    return total
```

- [ ] **Step 3: Sekcja drawdown w `_run_push_checks`**

W `stats` dodaj klucz: `'portfolio': 0` (linia `stats = {...}`). Przed pętlą `for username in users:` dodaj `fx_rates = _nbp_rates()`. Po sekcji alertów cenowych (po `finally:` z `save_watchlist`), a PRZED sekcją `daily_key`, wstaw:

```python
        # ── 1b. Alert spadku portfela (drawdown od ATH) ──────────────────
        try:
            with _conn() as c, c.cursor() as cur:
                cur.execute("SELECT threshold_pct, triggered, ath_value FROM portfolio_alerts WHERE username=%s AND enabled", (username,))
                row = cur.fetchone()
            if row:
                threshold, was_triggered, ath = float(row[0]), bool(row[1]), row[2]
                value = _portfolio_market_value(username, price_cache, fx_rates)
                if value is not None and value > 0:
                    sets, params = [], []
                    if ath is None or value > float(ath):
                        ath = value
                        sets.append('ath_value=%s'); params.append(value)
                        if was_triggered:               # nowy szczyt = pełne odrobienie
                            sets.append('triggered=FALSE'); was_triggered = False
                    ath = float(ath)
                    if not was_triggered and value <= ath * (1 - threshold / 100):
                        dd = (1 - value / ath) * 100
                        _send_push(username, f'📉 Portfel −{dd:.1f}% od szczytu',
                                   f'Wartość: {value:,.0f} zł (szczyt: {ath:,.0f} zł)', '/')
                        sets.append('triggered=TRUE'); sets.append('last_sent_at=NOW()')
                        stats['portfolio'] += 1
                    elif was_triggered and value >= ath * (1 - threshold / 200):
                        sets.append('triggered=FALSE')  # odrobił połowę — uzbrój ponownie
                    if sets:
                        with _conn() as c, c.cursor() as cur:
                            cur.execute(f"UPDATE portfolio_alerts SET {', '.join(sets)} WHERE username=%s",
                                        (*params, username))
        except Exception as e:
            print(f'[push] portfolio alert {username}: {e}')
```

- [ ] **Step 4: Route GET (po bloku `/api/push/vapid-key`)**

```python
        elif path == '/api/portfolio-alert':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            with _conn() as c, c.cursor() as cur:
                cur.execute("SELECT enabled, threshold_pct FROM portfolio_alerts WHERE username=%s", (username,))
                row = cur.fetchone()
            if row:
                self.send_json(200, {'enabled': bool(row[0]), 'thresholdPct': float(row[1])})
            else:
                self.send_json(200, {'enabled': False, 'thresholdPct': 10})
            return
```

- [ ] **Step 5: Route POST (po bloku `/api/push/test`)**

```python
        elif path == '/api/portfolio-alert':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                body = self.read_json(max_size=1024)
                enabled = bool(body.get('enabled'))
                threshold = float(body.get('thresholdPct') or 0)
                if enabled and not (0.5 <= threshold <= 90):
                    self.send_json(400, {'error': 'thresholdPct must be 0.5-90'}); return
                with _conn() as c, c.cursor() as cur:
                    cur.execute("""
                        INSERT INTO portfolio_alerts (username, threshold_pct, enabled)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (username) DO UPDATE
                        SET threshold_pct=EXCLUDED.threshold_pct, enabled=EXCLUDED.enabled,
                            triggered=FALSE, ath_value=NULL
                    """, (username, threshold or 10, enabled))
                self.send_json(200, {'ok': True})
            except Exception as e:
                print(f'[push] portfolio-alert save: {e}')
                self.send_json(400, {'error': 'bad request'})
```

Uwaga: zmiana progu resetuje `ath_value` i `triggered` — świeży start pomiaru (celowe, prostsze niż migracja stanu).

- [ ] **Step 6: Kompilacja + test wyceny na żywo**

```bash
python3 -m py_compile server.py && echo COMPILE-OK
python3 - <<'EOF'
import importlib.util
spec = importlib.util.spec_from_file_location('srv', 'server.py')
srv = importlib.util.module_from_spec(spec); spec.loader.exec_module(srv)
rates = srv._nbp_rates()
assert rates.get('PLN') == 1.0 and rates.get('USD', 0) > 2, rates
v = srv._portfolio_market_value('adamxdd', {}, rates)
print('wycena adamxdd:', v)
assert v is None or v > 0
print('OK')
EOF
```
Expected: `COMPILE-OK`, wycena rzędu kilkudziesięciu tys. zł (Dashboard pokazuje ~54 tys. zł; serwerowa wycena będzie NIŻSZA — bez obligacji — to poprawne) i `OK`. TYLKO ODCZYT z bazy — bez UPDATE/INSERT na koncie adamxdd.

- [ ] **Step 7: Commit**

```bash
git add server.py
git -c user.name="Z00mer0" -c user.email="gorski.a.r@gmail.com" commit -m "feat(push): alert spadku portfela od ATH + API /api/portfolio-alert"
```

---

### Task 4: Watchlist.jsx — wybór rodzaju alertu w modalu + chipy

**Files:**
- Modify: `frontend-react/src/pages/Watchlist.jsx` — komponent `AlertModal` (~linie 51-100) i rendering chipów (~linie 235-242)
- Modify: `frontend-react/src/translations/pl.js`, `frontend-react/src/translations/en.js` — nowe klucze

**Interfaces:**
- Consumes: obiekt alertu z Task 2: `{id, kind, type, targetPrice?, targetPercent?, mode, triggered}`.
- Produces: `onSave(...)` tworzy alert z polem `kind`; klucze tłumaczeń wymienione niżej.

- [ ] **Step 1: Dodaj klucze tłumaczeń**

W `pl.js`, bezpośrednio po istniejących kluczach `alert_mode_repeat_hint`:
```js
  alert_kind_price:     'Cena',
  alert_kind_daily:     'Zmiana dzienna',
  alert_kind_week52:    '52 tygodnie',
  alert_rise_min:       '↑ Wzrost o co najmniej',
  alert_fall_min:       '↓ Spadek o co najmniej',
  alert_new_high:       '🚀 Nowe maksimum',
  alert_new_low:        '⚓ Nowe minimum',
  alert_pct_placeholder: 'np. 5',
```
W `en.js`, analogicznie:
```js
  alert_kind_price:     'Price',
  alert_kind_daily:     'Daily change',
  alert_kind_week52:    '52 weeks',
  alert_rise_min:       '↑ Rise of at least',
  alert_fall_min:       '↓ Drop of at least',
  alert_new_high:       '🚀 New high',
  alert_new_low:        '⚓ New low',
  alert_pct_placeholder: 'e.g. 5',
```

- [ ] **Step 2: Przebuduj `AlertModal`**

Obecny stan (po zmianach z trybami): `useState` dla `type`, `mode`, `price`; `handleAdd` z `alreadyMet`; przyciski above/below; input ceny; przyciski trybu; hint. Zamień CAŁY komponent `AlertModal` na:

```jsx
function AlertModal({ item, onClose, onSave, livePrice }) {
  const t = useT();
  const [kind, setKind] = useState('price');
  const [type, setType] = useState('above');
  const [mode, setMode] = useState('rearm');
  const [price, setPrice] = useState(livePrice?.price != null ? String(livePrice.price.toFixed(2)) : '');
  const [pct, setPct] = useState('');

  function switchKind(k) {
    setKind(k);
    setMode(k === 'price' ? 'rearm' : 'repeat'); // sensowne domyślne tryby
  }

  function handleAdd() {
    if (kind === 'price') {
      if (!price || isNaN(parseFloat(price))) return;
      const target = parseFloat(price);
      const currentPrice = livePrice?.price ?? item.addedPrice ?? 0;
      const alreadyMet = (type === 'above' && currentPrice >= target) || (type === 'below' && currentPrice <= target);
      onSave({ id: genId(), kind, type, targetPrice: target, mode, triggered: mode === 'repeat' ? false : alreadyMet });
    } else if (kind === 'dailyChange') {
      const p = parseFloat(pct);
      if (!p || p <= 0) return;
      onSave({ id: genId(), kind, type, targetPercent: p, mode, triggered: false });
    } else { // week52
      onSave({ id: genId(), kind, type, mode, triggered: false });
    }
  }

  const typeLabels = kind === 'price'
    ? { above: t('above_alert'), below: t('below_alert') }
    : kind === 'dailyChange'
      ? { above: t('alert_rise_min'), below: t('alert_fall_min') }
      : { above: t('alert_new_high'), below: t('alert_new_low') };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" style={{ width: 340, padding: 24 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🔔 Alert — {item.symbol}</h2>
        {livePrice?.price != null
          ? <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12 }}>Aktualna cena: {livePrice.price.toFixed(2)} {item.currency}</p>
          : item.addedPrice != null && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12 }}>{item.addedPrice.toFixed(2)} {item.currency}</p>
        }
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[['price', 'alert_kind_price'], ['dailyChange', 'alert_kind_daily'], ['week52', 'alert_kind_week52']].map(([k, key]) => (
            <button key={k} onClick={() => switchKind(k)} className={`btn ${kind === k ? 'btn-primary' : ''}`}
              style={{ flex: 1, justifyContent: 'center', fontSize: 11, padding: '6px 4px' }}>
              {t(key)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {['above', 'below'].map(tp => (
            <button key={tp} onClick={() => setType(tp)} className={`btn ${type === tp ? 'btn-primary' : ''}`} style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}>
              {typeLabels[tp]}
            </button>
          ))}
        </div>
        {kind === 'price' && (
          <input type="number" placeholder={t('col_price')} value={price} onChange={e => setPrice(e.target.value)}
            className="field-input" style={{ marginBottom: 16 }} autoFocus />
        )}
        {kind === 'dailyChange' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input type="number" placeholder={t('alert_pct_placeholder')} value={pct} onChange={e => setPct(e.target.value)}
              className="field-input" style={{ flex: 1 }} autoFocus />
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>%</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {['once', 'rearm', 'repeat'].map(m => (
            <button key={m} onClick={() => setMode(m)} className={`btn ${mode === m ? 'btn-primary' : ''}`}
              style={{ flex: 1, justifyContent: 'center', fontSize: 11, padding: '6px 4px' }}>
              {t(`alert_mode_${m}`)}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 20, minHeight: 28 }}>{t(`alert_mode_${mode}_hint`)}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="btn" style={{ flex: 1, justifyContent: 'center' }}>{t('cancel')}</button>
          <button onClick={handleAdd} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{t('add_btn')}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Chipy alertów pokazują rodzaj**

W renderingu chipów zamień treść przycisku (fragment `{a.type === 'above' ? '↑' : '↓'} {a.targetPrice?.toFixed(2)}{a.mode === 'rearm' ? ' ↻' : a.mode === 'repeat' ? ' 🔁' : ''}`) na:

```jsx
                              {(a.kind === 'dailyChange')
                                ? `${a.type === 'above' ? '↑' : '↓'}${a.targetPercent}% dziś`
                                : (a.kind === 'week52')
                                  ? `52W ${a.type === 'above' ? '↑' : '↓'}`
                                  : `${a.type === 'above' ? '↑' : '↓'} ${a.targetPrice?.toFixed(2)}`}
                              {a.mode === 'rearm' ? ' ↻' : a.mode === 'repeat' ? ' 🔁' : ''}
```

- [ ] **Step 4: Build**

Run: `cd frontend-react && npm run build 2>&1 | tail -3`
Expected: `✓ built` bez błędów.

- [ ] **Step 5: Commit**

```bash
git add frontend-react/src/pages/Watchlist.jsx frontend-react/src/translations/pl.js frontend-react/src/translations/en.js
git -c user.name="Z00mer0" -c user.email="gorski.a.r@gmail.com" commit -m "feat(watchlist): alerty zmiany dziennej i 52 tygodni w modalu"
```

---

### Task 5: Settings.jsx — karta „Alert spadku portfela"

**Files:**
- Modify: `frontend-react/src/pages/Settings.jsx` — nowy komponent karty + montaż w `Settings()`
- Modify: `frontend-react/src/translations/pl.js`, `frontend-react/src/translations/en.js`

**Interfaces:**
- Consumes: `GET /api/portfolio-alert` → `{enabled, thresholdPct}`; `POST /api/portfolio-alert` body `{enabled, thresholdPct}` (Task 3). Wzorzec auth: lokalny `authHeader()` jak w innych plikach — sprawdź, czy Settings.jsx już go ma (używa API do zmiany hasła itd.); jeśli tak, użyj istniejącego.

- [ ] **Step 1: Klucze tłumaczeń**

`pl.js` (po kluczach z Task 4):
```js
  pa_title:        'Alert spadku portfela',
  pa_desc:         'Push, gdy wartość rynkowa portfela (akcje + gotówka, bez obligacji) spadnie od szczytu o próg. Szczyt mierzony od włączenia alertu.',
  pa_threshold:    'Próg spadku',
  pa_enable:       'Włącz alert',
  pa_disable:      'Wyłącz alert',
  pa_saved:        'Zapisano',
  pa_error:        'Błąd zapisu',
```
`en.js`:
```js
  pa_title:        'Portfolio drawdown alert',
  pa_desc:         'Push when the market value of your portfolio (stocks + cash, bonds excluded) falls from its peak by the threshold. Peak is measured from when the alert is enabled.',
  pa_threshold:    'Drop threshold',
  pa_enable:       'Enable alert',
  pa_disable:      'Disable alert',
  pa_saved:        'Saved',
  pa_error:        'Save failed',
```

- [ ] **Step 2: Komponent karty (wstaw przed `export default function Settings()`)**

```jsx
function PortfolioAlertCard() {
  const t = useT();
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(10);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/portfolio-alert', { headers: authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setEnabled(d.enabled); setThreshold(d.thresholdPct); } })
      .catch(() => {});
  }, []);

  async function save(nextEnabled, nextThreshold) {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/portfolio-alert', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled, thresholdPct: nextThreshold }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEnabled(nextEnabled); setThreshold(nextThreshold);
      setMsg(t('pa_saved'));
    } catch {
      setMsg(t('pa_error'));
    } finally { setBusy(false); }
  }

  return (
    <Card title={`📉 ${t('pa_title')}`}>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>{t('pa_desc')}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('pa_threshold')}</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {[5, 10, 15, 20].map(p => (
            <button key={p} className={`btn ${threshold === p ? 'btn-primary' : ''}`} disabled={busy}
              onClick={() => (enabled ? save(true, p) : setThreshold(p))}
              style={{ fontSize: 11, padding: '6px 10px' }}>
              −{p}%
            </button>
          ))}
        </div>
        <button className={`btn ${enabled ? '' : 'btn-primary'}`} disabled={busy}
          onClick={() => save(!enabled, threshold)} style={{ fontSize: 11 }}>
          {enabled ? t('pa_disable') : t('pa_enable')}
        </button>
        {msg && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{msg}</span>}
      </div>
    </Card>
  );
}
```

Sprawdź importy Settings.jsx: potrzebne `useState`, `useEffect`, `useT`, `Card`, `authHeader` — wszystkie powinny już być w pliku (są tam inne karty korzystające z API). Jeśli `authHeader` nie istnieje w tym pliku, dodaj lokalny one-liner jak w Watchlist.jsx.

- [ ] **Step 3: Montaż karty**

W `export default function Settings()` wstaw `<PortfolioAlertCard />` bezpośrednio po karcie `<Card title={t('account')}>…</Card>` (sekcja konta — alert dotyczy konta, nie danych).

- [ ] **Step 4: Build**

Run: `cd frontend-react && npm run build 2>&1 | tail -3`
Expected: `✓ built` bez błędów.

- [ ] **Step 5: Commit**

```bash
git add frontend-react/src/pages/Settings.jsx frontend-react/src/translations/pl.js frontend-react/src/translations/en.js
git -c user.name="Z00mer0" -c user.email="gorski.a.r@gmail.com" commit -m "feat(settings): konfiguracja alertu spadku portfela"
```

---

### Task 6: Deploy + weryfikacja produkcyjna E2E (wykonuje sesja główna, nie subagent)

- [ ] Review całości brancha, `git push` (auto-deploy Render + Vercel), `cd frontend-react && vercel --prod` jeśli Vercel nie zbuduje sam
- [ ] `curl` prod `/api/quotes?symbols=PKN.WA` → są `fiftyTwoWeekHigh/Low`
- [ ] Test syntetyczny na koncie demo (wzorzec z Web Push): alert `dailyChange` z progiem 0.01% (gwarantowany hit) + alert `week52` + `portfolio_alerts` z `ath_value` sztucznie zawyżonym → `gh workflow run push-check.yml` → stats `priceAlerts`/`portfolio` rosną → sprzątnięcie konta demo
- [ ] Weryfikacja UI na prod: modal alertów (3 rodzaje), karta w Ustawieniach
