# Rozszerzone typy alertów — design

**Data:** 2026-07-17 · **Status:** zatwierdzony przez użytkownika

## Cel

Rozszerzyć istniejące alerty push (dziś: tylko cena above/below na spółkach z watchlisty)
o trzy nowe typy:

1. **Zmiana dzienna** — spółka rośnie/spada dziś o ≥ X%
2. **52 tygodnie** — spółka ustanawia nowe 52-tygodniowe maksimum lub minimum
3. **Spadek portfela** — wartość części rynkowej portfela spada o ≥ X% od szczytu (ATH)

Typy 1–2 są per-spółka (watchlista), typ 3 per-użytkownik (Ustawienia).

## Fakty techniczne (zweryfikowane)

- Yahoo v8 chart meta (źródło `api/quotes.js`) zwraca w JEDNYM zapytaniu:
  `regularMarketPrice`, `chartPreviousClose`, `fiftyTwoWeekHigh`, `fiftyTwoWeekLow`.
  Zero dodatkowych zapytań.
- Ścieżka zapasowa stooq zwraca tylko cenę — nowe typy alertów są wtedy pomijane
  w danym cyklu (degradacja łagodna, bez błędu).
- `portfolio_snapshots (portfolio_id, date, total, invested)` ma historię wartości —
  ATH liczymy jako `MAX(total)`.
- Backend ma już: `_nbp_rates()`, tryby once/rearm/repeat z cooldownem 24h
  (`ALERT_REPEAT_COOLDOWN_H`), dedupe (`push_sent`), `_send_push`.

## Model danych

### Alerty per-spółka (bez migracji)

Obiekt alertu w `user_watchlist.items_json[].alerts[]` dostaje pole `kind`:

```json
{ "id": "…", "kind": "price",       "type": "above|below", "targetPrice": 150,  "mode": "…", "triggered": false }
{ "id": "…", "kind": "dailyChange", "type": "above|below", "targetPercent": 5,  "mode": "repeat", "triggered": false }
{ "id": "…", "kind": "week52",      "type": "above|below", "mode": "repeat", "triggered": false }
```

- Brak pola `kind` ⇒ `price` (stare alerty działają bez zmian).
- `week52`: `above` = nowe maksimum, `below` = nowe minimum; bez progu liczbowego.
- `dailyChange`: `above` = wzrost ≥ targetPercent, `below` = spadek ≥ targetPercent
  (targetPercent zawsze dodatni).
- Domyślny tryb dla `dailyChange` i `week52`: `repeat` (cooldown 24h = maks. 1 push/dzień);
  użytkownik może zmienić.

### Alert portfelowy (nowa tabela)

```sql
CREATE TABLE IF NOT EXISTS portfolio_alerts (
    username      TEXT PRIMARY KEY,
    threshold_pct NUMERIC NOT NULL,     -- np. 10 = alert przy −10% od ATH
    enabled       BOOLEAN DEFAULT TRUE,
    triggered     BOOLEAN DEFAULT FALSE, -- stan histerezy
    last_sent_at  TIMESTAMPTZ
)
```

Jeden alert na użytkownika (YAGNI — nie per-portfel; wycena agreguje wszystkie
portfele użytkownika, spójnie z Dashboardem, który pokazuje sumę).

## Semantyka wyzwalania

### dailyChange
- `hit = changePct >= targetPercent` (above) / `changePct <= -targetPercent` (below).
- Tryby jak w price: `once` — raz i koniec; `rearm` — uzbraja się, gdy warunek
  przestaje zachodzić (w praktyce następnego dnia); `repeat` — cooldown 24h.
- Brak `changePct` w danych (ścieżka stooq) ⇒ pomiń alert w tym cyklu.

### week52
- `hit = price >= fiftyTwoWeekHigh` (above) / `price <= fiftyTwoWeekLow` (below).
- Uwaga: gdy spółka JEST na maksimum, Yahoo aktualizuje high do bieżącej ceny, więc
  warunek zachodzi cały dzień — cooldown 24h w trybie `repeat` ogranicza do 1 pusha/dzień,
  a `rearm` uzbroi się dopiero po zejściu z maksimum. To zamierzone.
- Brak danych 52W (stooq) ⇒ pomiń w tym cyklu.

### Spadek portfela (drawdown)
- Wycena serwerowa co cykl crona, tylko dla użytkowników z `enabled=TRUE` i subskrypcją push:
  `wartość = Σ (qty × cena_bieżąca × kurs_NBP→PLN) po portfolio_holdings + Σ portfolio_cash (PLN po NBP)`.
- **Świadome pominięcie:** obligacje EDO/COI i inne aktywa (stabilne, bez ryzyka dziennego;
  pełna wycena obligacji żyje we frontendzie). ATH liczone spójnie — z snapshotów
  odfiltrować się nie da, więc: `ATH = MAX(total) z portfolio_snapshots` wszystkich portfeli
  użytkownika zsumowane per-data… **Decyzja upraszczająca:** ATH liczymy z tej samej
  serwerowej wyceny — tabela `portfolio_alerts` dostaje kolumnę `ath_value NUMERIC`,
  aktualizowaną gdy bieżąca wycena > ath_value. Snapshoty NIE są źródłem ATH
  (inna metodologia wyceny = fałszywe alarmy). Pierwsze uruchomienie: ath_value = bieżąca
  wycena, alert zacznie działać od tego punktu.
- `hit = wartość <= ath_value × (1 − threshold_pct/100)`.
- Histereza: po wysłaniu `triggered=TRUE`; reset (`triggered=FALSE`) gdy wartość odrobi
  połowę spadku: `wartość >= ath_value × (1 − threshold_pct/200)`.
- Jeśli ceny części pozycji niedostępne w cyklu ⇒ pomiń cały check portfelowy
  (częściowa wycena = fałszywy drawdown).

## Zmiany w plikach

| Plik | Zmiana |
|---|---|
| `api/quotes.js` (+ kopia `frontend-react/api/quotes.js`) | przepuść `fiftyTwoWeekHigh/Low` w odpowiedzi (changePercent już jest) |
| `server.py` | `_fetch_price_simple` → `_fetch_quote` zwraca dict `{price, changePct, high52, low52}` (stooq: tylko price); adaptacja jedynego call-site'a; obsługa `kind` w pętli alertów; tabela `portfolio_alerts`; pętla drawdown; routes `GET/POST /api/portfolio-alert` |
| `frontend-react/src/pages/Watchlist.jsx` | AlertModal: wybór rodzaju (Cena / Zmiana dzienna / 52 tygodnie), warunkowe pola; chipy alertów pokazują rodzaj |
| `frontend-react/src/pages/Settings.jsx` | sekcja „Alert spadku portfela": włącznik + próg %, zapis przez API |
| `frontend-react/src/translations/{pl,en}.js` | nowe klucze |

## Treści powiadomień

- dailyChange: `📈 PKN.WA +5.2% dziś` / `📉 CDR.WA −6.1% dziś` + cena w body
- week52: `🚀 AAPL — nowe 52-tyg. maksimum` / `⚓ CDR.WA — nowe 52-tyg. minimum` + cena
- portfel: `📉 Portfel −10.3% od szczytu` + `Wartość: 54 200 zł (szczyt: 60 400 zł)` + url `/`

## Poza zakresem

- Alerty per-portfel (jest per-użytkownik)
- Wycena obligacji/innych aktywów na serwerze
- Zmiana częstotliwości crona (GitHub dławi do ~1h — bez zmian)
- E-mail jako drugi kanał

## Addendum (2026-07-17 wieczorem): podsumowanie sesji USA

Zamówione przez użytkownika po wdrożeniu: push z wartością portfela (wzrost LUB spadek)
na otwarcie i zamknięcie sesji amerykańskiej.

- Kolumna `us_summary BOOLEAN DEFAULT FALSE` w `portfolio_alerts` (ALTER ... IF NOT EXISTS);
  niezależna od `enabled` (drawdown).
- Okna czasowe w America/New_York (zoneinfo, odporne na DST), tylko dni robocze:
  otwarcie 9:30–11:30 ET, zamknięcie 16:00–18:00 ET. Dedupe przez `push_sent`
  z kluczami `ussum:open:{data_ET}` / `ussum:close:{data_ET}` — maks. 1 push na okno.
- Wycena jak w drawdownie (akcje+gotówka, PLN po NBP); zmiana dzienna liczona z
  `changePct` per pozycja (prev_price = price/(1+chg/100)); gdy chg brakuje dla
  którejś pozycji → pct pomijane (sam poziom wartości), wartość None → cały skip.
- Treść: `🇺🇸 Otwarcie — portfel 159 336 zł` / `🏁 Zamknięcie — portfel …`,
  body `Zmiana dziś: +0.42%`.
- API GET/POST `/api/portfolio-alert` przenosi dodatkowe pole `usSummary`.
  POST przestaje bezwarunkowo resetować ath_value/triggered — reset TYLKO gdy
  zmienił się `thresholdPct` lub `enabled` (naprawia uwagę Minor d z review).
- Workflow: dodatkowe crony `40 13 * * 1-5` i `10 20 * * 1-5` UTC (punktualność
  w lecie; okna ET gwarantują poprawność niezależnie od DST).
- UI: drugi przełącznik w PortfolioAlertCard; POST zawsze wysyła komplet
  {enabled, thresholdPct, usSummary}.
