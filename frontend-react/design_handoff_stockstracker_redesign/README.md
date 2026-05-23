# Handoff: stockstracker — Modern Dark Redesign

## Overview
Kompletny redesign aplikacji **myfund-app.vercel.app** (StocksTracker) — modernizacja warstwy wizualnej z zachowaniem identycznej struktury nawigacji i logiki domenowej. Estetyka łączy gęstość terminala (Bloomberg) z odważnymi akcentami i czytelnością (Robinhood). Główne cele:
- Czytelność liczb (monospace tabular-nums)
- Spójna paleta dark-first z opcjonalnym light
- Nowoczesna kompozycja kart, tabel i wykresów
- Polski interfejs

## About the Design Files
Pliki w tym pakiecie to **referencje projektowe stworzone w HTML/React (Babel)** — prototypy pokazujące zamierzony wygląd i zachowanie, **nie kod produkcyjny do skopiowania**. Zadanie: **odtworzyć te ekrany w istniejącym środowisku myfund-app** (najpewniej Next.js + React, sądząc po Vercel) używając ustalonych w projekcie wzorców, bibliotek wykresów (recharts/visx/tradingview) i routingu.

## Fidelity
**High-fidelity (hifi)** — pixel-perfect: dokładne kolory (hex), typografia, odstępy, interakcje. Należy odtworzyć UI 1:1 z prototypów, używając bibliotek dostępnych w docelowym repo.

## Stack docelowy (założenia)
- **Next.js + React** (na podstawie hostingu Vercel)
- Routing: `/dashboard`, `/portfolio`, `/history`, `/transactions`, `/dividends`, `/calendar`, `/watchlist`, `/scenario`, `/analysis`, `/settings`
- Biblioteka wykresów: dowolna (Recharts / visx / lightweight-charts) — w prototypie wszystko narysowane ręcznie w SVG
- State: dane są dziś trzymane lokalnie / w localStorage — zostawić bez zmian, zmienia się tylko warstwa wizualna

---

## Design Tokens

### Colors (CSS Custom Properties)

Dark theme (default):
```css
--bg:            #0a0b0d;   /* główne tło aplikacji */
--bg-2:          #0f1115;   /* tło sidebara */
--panel:         #13161b;   /* karty, panele, tabele */
--panel-2:       #181c22;   /* tła wtórne (logo placeholdery, segmenty) */
--panel-hover:   #1c2028;   /* hover na wierszach tabeli/nav */
--border:        #20252d;   /* standardowe obramowanie */
--border-strong: #2a313b;   /* mocniejsze, na hover/focus */
--text:          #e8ebef;
--text-dim:      #8a929d;
--text-faint:    #5a626c;
--up:            #00d97e;   /* wzrost / pozytyw */
--up-soft:       rgba(0, 217, 126, 0.12);
--down:          #ff4d6d;   /* spadek / strata */
--down-soft:     rgba(255, 77, 109, 0.12);
--accent:        #00d97e;   /* domyślnie = up, ale konfigurowalny */
--warn:          #ffb020;   /* alerty, prowizje */
--info:          #7c9eff;   /* benchmark, info-tagi */
```

Light theme (przełącznik):
```css
--bg:            #f6f7f9;
--bg-2:          #ffffff;
--panel:         #ffffff;
--panel-2:       #fafbfc;
--panel-hover:   #f1f3f6;
--border:        #e6e9ed;
--border-strong: #d1d6dc;
--text:          #0e1116;
--text-dim:      #5a626c;
--text-faint:    #8a929d;
--up:            #009d5a;
--down:          #d92d4e;
```

### Typography
- **Sans (UI)**: `Inter` (400/500/600/700) — Google Fonts
- **Mono (liczby, tickery)**: `JetBrains Mono` (400/500/600/700)
- Liczby zawsze z `font-variant-numeric: tabular-nums; letter-spacing: -0.01em`
- Rozmiary:
  - Page title: 22px / 600 / -0.01em
  - KPI value: 26px / 600 / -0.02em
  - Chart value: 34px / 600 / -0.02em
  - Card title: 13px / 600 / uppercase / 0.02em letter-spacing
  - Table th: 10.5px / 600 / uppercase / 0.1em
  - Body: 14px / 1.5
  - Tag: 10.5px / mono / uppercase / 0.06em

### Spacing & Radii
- Sidebar width: **232px**
- Topbar height: **56px**
- Page padding: **24px 28px 60px**
- Card radius: **10px** (`--radius`), small: 6px, large: 14px
- KPI grid gap: 14px
- Stack gap mid: 16-18px

### Shadows / Borders
- Brak heavy shadows. Subtelne `inset 0 0 0 1px var(--border)` dla aktywnych elementów nav.
- Tabele/karty: 1px solid `--border`, hover: tło `--panel-hover`.

---

## Layout / App Shell

```
┌─────────────────────────────────────────────────────────────┐
│  [sidebar 232px]  │  topbar (56px)                          │
│                   ├─────────────────────────────────────────┤
│  brand            │                                         │
│  Główne           │           page content                  │
│   • Dashboard     │           (max-width: 1640px)           │
│   • Portfel       │                                         │
│   • Historia      │                                         │
│   • Transakcje    │                                         │
│   • Dywidendy     │                                         │
│   • Kalendarz     │                                         │
│   • Watchlist     │                                         │
│   • Scenario Lab  │                                         │
│   • Atrybucja     │                                         │
│  Konto            │                                         │
│   • Ustawienia    │                                         │
│  ── (foot) ──     │                                         │
│  [A] Adam · GPW   │                                         │
└─────────────────────────────────────────────────────────────┘
```

**Sidebar:**
- `background: var(--bg-2)`, `border-right: 1px solid var(--border)`
- Brand: 30×30 kwadrat z gradientem `linear-gradient(135deg, var(--accent), color-mix(in oklab, var(--accent), #000 25%))`, ikona trending-up wewnątrz, obok napis `stockstracker.` (kropka w kolorze akcentu)
- Nav item: padding 9×10, radius 8px. Active: tło `--panel`, 3px lewy pasek w `--accent`. Hover: `--panel-hover`.
- Sekcje: caps "GŁÓWNE" / "KONTO" — 10px, 0.12em, `--text-faint`.

**Topbar:**
- Sticky, z-index 10, `border-bottom: 1px solid var(--border)`
- Search input (max 420px) z ikoną lupy i `kbd ⌘K` po prawej
- Pasek tickerów (WIG20, WIG30, mWIG40, S&P500, DAX, EUR/PLN, USD/PLN) jako inline-flex z gap 18px — sym (caps, 11px, dim) + value (mono 12px) + delta (mono, color-coded)
- Akcje po prawej: dzwonek z czerwoną kropką + primary button "Dodaj transakcję" w `--accent` z tekstem `#051a10`

---

## Screens / Views

### 1. Dashboard (`/dashboard`)

**Cel:** szybki przegląd portfela, główne KPI, top movery, alokacja, najlepsze/najgorsze pozycje.

**Layout:**
- Page head: tytuł "Witaj z powrotem, Adam" + sub "Czwartek, 21 maja 2026 · sesja otwarta · GPW, NYSE, LSE". Po prawej: `Eksport CSV`, `Filtry` (ghost buttons).
- KPI grid (4 kolumny, gap 14px):
  1. **Wartość portfela**: główna kwota PLN, chip ze zmianą % dzienną, sub "Dzień: +/-X zł"
  2. **Zysk/strata**: total P&L w zł (kolor), chip z %, sub "Koszt zakupu: …"
  3. **Dywidendy YTD**: kwota, chip "+12.4%", sub "Najbliższa: XTB · 4 czerwca"
  4. **Wolne środki**: gotówka PLN, chip "3.62% / rok", sub "Konto maklerskie · PLN"
- Wykres + Top ruchy (grid 1fr / 380px):
  - Lewa karta: AreaChart (linia + gradient pod nią, siatka pozioma), Timeframe segmented control (1D 1T 1M 3M 1R YTD MAX) po prawej
  - Prawa karta: lista top 5 ruchów dnia — logo ticker (32×32, mono, panel-2 bg), nazwa/sym + sub, sparkline 70×26, kurs + delta %
- Allocation + Best/Worst (3 kolumny):
  - **Alokacja sektorowa**: donut (Tech=info, Gaming=fiolet, Energy=warn, Retail=accent, Auto=down, Finance=info) + legenda 4-kolumnowa (swatch / label / % / wartość k)
  - **Najlepsze pozycje**: top 4 wg zwrotu %
  - **Pod presją**: bottom 3

**KPI komponent:**
```
┌────────────────────┐
│ LABEL (caps 11px)  │
│                    │
│ 234 567 zł         │  ← mono 26px 600
│                    │
│ [+2.41%] Dzień: …  │  ← chip + sub
└────────────────────┘
```

### 2. Portfel (`/portfolio`)

**Cel:** główna tabela wszystkich pozycji + wykres wartości portfela.

**Layout:**
- KPI/Snapshot card (1 row): "Łączny koszt portfela: 34 245,92 zł" + "8 pozycji" po prawej
- Wykres portfela (pełna szerokość) z toggle LINIA / ŚWIECE / HEATMAP, timeframe segmented
- Tabela pozycji:
  - Kolumny: Aktywo (logo + sym + nazwa·waluta), Ilość, Śr. kurs, Kurs, Dzień (%, color), Wartość (zł), Zysk/strata (kolor), Zwrot % (chip), Udział (% + pasek mini), 30D (sparkline)
  - Sortowanie po kliknięciu nagłówka
  - Hover wiersza: tło `--panel-hover`, cursor: pointer
  - Klik wiersza → przejście do Stock Detail
  - Filtry po prawej w card-head: segmented [Wszystkie · PL · US]

**Heatmap (alternatywny widok):**
- Auto-fill grid, komórki 160×90, span 2 dla pozycji >10% portfela
- Tło: `oklch(0.55 0.18 150)` dla wzrostów, `oklch(0.55 0.18 20)` dla spadków, lightness/chroma skalowane intensywnością d1%
- W komórce: ticker (mono 13px 700) + zmiana % (mono 12px 600), oba w jasnym tekście

### 3. Historia (`/history`)

**Cel:** historia wartości portfela z benchmarkami i tabela snapshotów.

**Layout:**
- KPI grid (4 kolumny):
  1. Aktualna wartość (z chipem dziennej zmiany)
  2. Zainwestowano (koszt)
  3. Zmiana od początku (kwota + chip %)
  4. ATH (szczyt) — z datą i drawdownem
- Karta z wykresem:
  - AreaChart "wartość portfela" (zielona linia + gradient pod nią) + linia "zainwestowano" (dashed, faint, bez fill)
  - Toggle benchmark: Brak / S&P 500 / WIG20 / MSCI World (gdy aktywny — DualLine, benchmark dashed info)
  - Timeframe: 1M / 3M / 6M / 1R / MAX
- Tabela "Wszystkie snapshots":
  - Kolumny: Data | Wartość | Zainwestowano | P&L | Zwrot (chip) | Drawdown

### 4. Transakcje (`/transactions`)

**Cel:** historia ruchów (buy/sell/dividend/fee).

**Layout:**
- KPI: Kupna 30d, Sprzedaże 30d, Dywidendy 30d, Prowizje 30d
- Tabela: Data | Typ (tag: buy/sell/div/fee, kolorowane) | Aktywo (logo + sym) | Ilość | Cena | Wartość | Waluta | "···" menu
- Filtr segmented: Wszystkie / Kupno / Sprzedaż / Dywidendy / Prowizje

### 5. Dywidendy (`/dividends`)

**Cel:** kalendarz wypłat, Yield on Cost, historia.

**Layout:**
- Toggle BRUTTO / NETTO (top-right)
- KPI (3 kolumny):
  1. "Dywidendy 12 mies. · BRUTTO/NETTO" w `--up`, chip "+73.5%"
  2. "Yield portfela (proj.)" w %, chip "3 nowe"
  3. "Nadchodzące (30 dni)" — licznik + najbliższa
- Karta "Nadchodzące dywidendy" — tabela: Spółka | Dzień wypłaty | Status (tag ZATWIERDZONA/ZAPOWIEDZIANA) | Stawka/szt | Yield | Twoja wypłata
- Grid 2 kolumny: Yield on Cost per spółka | Historia wypłat

### 6. Kalendarz (`/calendar`)

**Cel:** wyniki spółek, makro, dywidendy w widoku miesięcznym.

**Layout:**
- Card head: prev/next miesiąc + tytuł "Maj 2026" + legenda po prawej (kropki: ● Wyniki/makro wysoki = red, ● Dywidenda/makro średni = warn) + przycisk "Dziś"
- Grid 7 kolumn (Pn-Nd, monday-first, polski locale):
  - Komórka dnia: min-height 88px, padding 8px, border-radius 6px
  - Numer dnia po prawej górze, eventy na dole (5px kropka + skrócony tytuł, max 2 + "+N")
  - Today: tło `--panel-2`, border w `--accent`
  - Dimmed dni z poprzedniego/następnego miesiąca: opacity 0.35
- Lista zdarzeń poniżej z filtrami: importance [All/High/Medium/Low], typ [All/Wyniki/Dywidendy/Makro]
- Każde zdarzenie: 4px lewy color-bar (kolor wg ważności) + tytuł + data·waluta, po prawej tagi [KATEGORIA] [WAŻNOŚĆ]

### 7. Watchlist (`/watchlist`)

**Cel:** obserwowane spółki bez pozycji.

**Layout:**
- Tabela: Aktywo | Kurs | Dzień % | Trend 30D (sparkline 120×32) | Akcje (button "Kup" ghost)
- Klik wiersza → Stock Detail

### 8. Scenario Lab (`/scenario`)

**Cel:** kalkulator opcji vs akcji z payoff chart.

**Layout (grid 380px / 1fr):**
- **Lewa kolumna (inputs):**
  - Card "Konfiguracja": select "Spółka z portfela", input "Ticker opcji" + button "Pobierz łańcuch", select "Strategia" (Long Call / Long Put / Covered Call / Cash-secured Put / Bull Call Spread)
  - Card "Parametry": inputy: Cena wejścia ($), Ilość kontraktów, Strike Call, Premia, IV %, Data wygaśnięcia (DTE 30), checkbox "Ukryj linię bazową akcji"
- **Prawa kolumna:**
  - Payoff chart (320px): linia opcji w `--accent` (solid 2.4px), linia akcji w `--info` (dashed 1.8px, dashed 5/3), pionowe markery strike (text-faint dashed) i BE (accent dashed), zero line solid
  - Etykiety osi: $X dla x, +/-XXX dla y (w setkach $)
  - KPI metrics (4 + 4):
    - Row 1: Break-even, Max zysk (∞ w `--up`), Max strata (`--down`), POP %
    - Row 2: BPE (depozyt), ±1σ zakres, Delta, Theta

### 9. Atrybucja (`/analysis`)

**Cel:** ryzyko, rebalansowanie do celu, zysk/strata splits.

**Layout:**
- Karta "Analiza ryzyka" — 5 kolumn RiskKpi:
  - Zmienność (rok.) → 51.2% w `--down`
  - Max Drawdown → -15.6% w `--warn`
  - Sharpe Ratio → -3.67 w `--down`
  - Sortino Ratio → -2.45 w `--down`
  - Beta (S&P 500) → 0.98 (neutral)
  - Każde KPI: caps label, duża wartość mono 28px 600 w kolorze tonu, sub-text dim
- Karta "Rebalansowanie portfela" — button "Ustaw cele":
  - Wiersze: ticker (90px, info color) | pasek progress (linear-gradient `#7c9eff → #a78bfa`, height 16px, radius 4) | aktualne % (mono) | różnica od celu (mono, color-coded ±)
  - Pionowy znacznik celu na pasku w `--accent` (2px)
- KPI Tinted (4 kolumny):
  - Liczba pozycji (info bg)
  - Zyskowne (up bg)
  - Stratne (down bg)
  - Śr. zwrot (up/down bg w zależności)

### 10. Stock Detail (`/stock/[symbol]`)

**Cel:** szczegóły konkretnej spółki.

**Layout:**
- Breadcrumb: "Portfolio › DNP.WA"
- Header: logo 56×56 (radius 12) + nazwa spółki + tagi (TICKER · WALUTA · SEKTOR info-tinted) + duża cena mono 28px + chip delta + sub "· dzisiaj"
- Akcje po prawej: ghost "Obserwuj", danger "Sprzedaj", primary "Kup"
- Grid 1fr / 360px:
  - **Lewa**: wykres kursu (Area/Candles toggle), karta "Wiadomości" (4 itemy: 64×64 striped placeholder thumb + tytuł + tag + źródło · czas)
  - **Prawa**: 3 karty stacked:
    - "Twoja pozycja": Ilość / Śr. kurs / Koszt / Wartość / P&L (color) / % portfela
    - "Statystyki": Otwarcie / Zakres dzienny / Zakres 52T / Wolumen / Kapitalizacja / P/E / Dywidenda / Beta
    - "Ostatnie transakcje": filtrowane po symbolu

### 11. Ustawienia (`/settings`)

**Cel:** profile brokerów, podatki.

**Layout:**
- Grid 2 kolumny:
  - "Połączone konta brokerskie": lista (kropka status + nazwa + status text + button "Rozłącz/Połącz")
  - "Profil podatkowy": Rezydencja, Stopa (19% Belka), Strata przeniesiona, Należny podatek YTD

---

## Komponenty wspólne

### Card
```css
background: var(--panel);
border: 1px solid var(--border);
border-radius: 10px;
```
- `.card-head`: flex between, padding 14×16, border-bottom
- `.card-title`: caps 13px 600, dim color, letter-spacing 0.02em
- `.card-body`: padding 16px

### Button
- Default: height 34, padding 0×14, radius 8, border 1px `--border`, bg `--panel`
- `.primary`: bg `--accent`, color `#051a10`, font-weight 600
- `.danger`: color `--down`
- `.ghost`: transparent, hover gains border

### Chip (delta indicators)
```css
display: inline-flex;
font-family: mono;
font-size: 11.5px;
padding: 2px 7px;
border-radius: 4px;
font-weight: 600;
```
- `.up`: bg `--up-soft`, color `--up`
- `.down`: bg `--down-soft`, color `--down`
- Format: `▲ X.XX%` / `▼ X.XX%`

### Tag
- 10.5px mono uppercase, padding 3×7, radius 4, panel-2 bg + border
- Warianty: `.buy` (up), `.sell` (down), `.div` (info), `.fee` (warn)

### Segmented control (`.seg`)
- inline-flex w panel-2 + border, padding 2px gap 2px
- Buttons: mono 11.5px 600 uppercase, padding 4×10, radius 6
- Active: bg `--panel`, color text, inset shadow border

### Table
- th: text-align left, caps 10.5px 600, padding 12×14, border-bottom, sticky top, bg panel
- td: padding 14, border-bottom
- `.right`: text-align right (kolumny liczbowe)
- tr hover: bg `--panel-hover`

### Ticker logo
- 32×32 (mały: 26×26), radius 8, mono 11px 700, bg `--panel-2`, border `--border`
- Zawartość: pierwsze 2 znaki tickera

### Sparkline
- Inline SVG, domyślnie 80×28 (większy w wykresach detail)
- Kolor: zielony jeśli ostatnia > pierwsza, czerwony w przeciwnym razie
- Stroke 1.6px, opcjonalny fill 12% opacity

### AreaChart
- Padding 24px, siatka pozioma 5 linii (dashed 2/4, opacity 0.6)
- Etykiety osi Y po prawej (mono 10px, faint)
- Gradient pod linią (32% → 0%)
- Hover: pionowa linia + tooltip (panel-2 bg, mono 11px)

### CandleChart
- Świece: green dla close ≥ open, red dla spadku
- Body width: 62% step
- Wick: 1px line w kolorze świecy

### Donut
- thickness 24-26, circle background `--panel-2`
- Brak inner labelu — używamy zewnętrznej legendy

---

## Interactions & Behavior

### Navigation
- Klik nav item → setView(id) → render odpowiedniego ekranu
- Klik logo brand → /dashboard
- Klik wiersza tabeli pozycji/watchlist → /stock/[symbol]
- Klik breadcrumb → wstecz

### Hover states
- Nav: bg `--panel-hover`, text → `--text`
- Row: bg `--panel-hover`
- Button: bg lub border się rozjaśnia
- Iconbtn: jw.

### Animacje
- `dot-status` (kropka połączenia z brokerem): pulse 2.4s ease-in-out infinite (opacity 1→0.7, ring shadow)
- Wszystkie tła: transition 0.12s
- Brak ciężkich motion — preferuj subtelność

### Chart interactions
- AreaChart: hover pokazuje pionową linię + tooltip z wartością
- TimeframeSeg: zmiana okresu = re-generacja serii
- Toggle linia/świece/heatmap: instant swap, brak animacji

### Tweaks panel
- Toolbar toggle "Tweaks" pokazuje floating panel (bottom-right)
- Opcje: motyw (dark/light), kolor akcentu (swatches: #00d97e #7c9eff #a78bfa #ffb020 #ff4d6d), toggle ticker strip
- Zmiana akcentu = update `--accent`, `--up`, `--up-soft` w :root

---

## State Management

W docelowej aplikacji najprawdopodobniej już macie store/context dla:
- `positions` — lista pozycji z polami: sym, name, qty, avg, price, cur, sector, d1
- `transactions` — z polami: date, type (BUY|SELL|DIV|FEE), sym, qty, price, total, cur
- `snapshots` — historia wartości
- `dividends` — upcoming + history
- `watchlist`
- `tickerStrip` — indeksy/waluty na topbarze

**Nie zmieniaj logiki domeny.** Zostawcie computeP&L, FX conversion (USD→PLN) itd. dokładnie tak jak jest. Zmienia się WYŁĄCZNIE warstwa prezentacyjna.

Dodaj pochodne (jeśli ich nie ma):
- `dPLN = value * (d1/100)` — zmiana wartościowa dnia
- `pl = value - cost`, `plPct = pl / cost * 100`
- `totalValue / totalCost / totalPL / dayChange / dayChangePct`

### Theme state
- Przechowywać w `localStorage('theme')` (`dark` | `light`)
- Stosować przez `<html data-theme="...">` lub class na `<body>` — cały CSS reaguje na `[data-theme="light"]` selector

### Accent color
- Przechowywać w localStorage
- Aplikować przez `document.documentElement.style.setProperty('--accent', value)`
- Również override dla `--up` i `--up-soft` (akcent = kolor wzrostów)

---

## Assets

**Brak custom assetów.** Wszystko inline:
- Ikony nav: inline SVG (24×24 viewBox, stroke 2, currentColor) — można podmienić na lucide-react jeśli już macie
- Logo brand: inline SVG (trending-up)
- Logo spółek (ticker logos): pierwsze 2 litery tickera w monospace na panel-2 background — żadnych zewnętrznych obrazków. Opcjonalnie można dodać prawdziwe logo PNG.
- News thumbnails: striped CSS placeholder (`repeating-linear-gradient(45deg, ...)`). Docelowo prawdziwe og:image z API wiadomości.

---

## Files

Wszystkie pliki w tym katalogu — używaj jako referencji:

| Plik | Co zawiera |
|---|---|
| `stockstracker.html` | Główny entry — łączy wszystkie skrypty i style |
| `styles.css` | Wszystkie tokeny CSS + klasy komponentów |
| `data.js` | Mock data (positions, transactions, ticker strip) i helpery |
| `charts.jsx` | Sparkline, AreaChart, CandleChart, Donut, Heatmap, helpery formatowania (fmt, fmtPLN, fmtPct, fmtPctChip) |
| `shell.jsx` | Ikony (Ico), Sidebar, Topbar, TickerStrip |
| `screens-a.jsx` | Dashboard, Portfolio (+ HoldingsTable), Holdings, Kpi, TimeframeSeg |
| `screens-b.jsx` | StockDetail, Analytics (stara, lekka), Transactions, Watchlist, Settings, DualLine |
| `screens-c.jsx` | History, Dividends, Calendar, ScenarioLab, Attribution, RiskKpi, KpiTinted, PayoffChart, AreaChartWithLine |
| `app.jsx` | Root App, routing przez setView, Tweaks panel wire-up |
| `tweaks-panel.jsx` | Helper komponentów do paneli tweakerów (nie potrzebny w produkcji) |

**Standalone version**: `stockstracker-standalone.html` to gotowy do hostingu single-file bundle.

---

## Recommended migration path

1. **Skopiuj design tokens** (`:root` block z `styles.css`) do globalnego stylu w myfund-app
2. **Zaadoptuj nowy Sidebar + Topbar** jako shared layout (Next.js app dir: `app/layout.tsx`)
3. **Podmień style komponentów ekran po ekranie**, zaczynając od najprostszych: Settings → Watchlist → Transactions → Dashboard → ...
4. **Wykresy**: w prototypie wszystko narysowane ręcznie w SVG. W myfund-app prawdopodobnie używacie biblioteki — utrzymaj API biblioteki, tylko skonfiguruj kolory/grid wg tokens
5. **Tabele**: spójna stylistyka — wprowadź klasy `.table`, `.right`, sticky header, hover row
6. **Liczby**: wszędzie `tabular-nums`, `JetBrains Mono` dla danych finansowych
7. **Mobile**: ten redesign jest desktop-first (1280px+). Mobile wymaga osobnej rundy (kolapsowalny sidebar, sticky tabbar, większe hit-targety)

---

## Otwarte pytania / sprawy do uzgodnienia

- **Czy zostać przy dark-first**, czy light-first? Prototyp ma oba, default = dark.
- **Akcent zielony** vs niebieski/fioletowy — pasek do dyskusji, w prototypie tweakowalne.
- **Logo spółek** — zostać przy "first 2 chars w monospace" (bardzo terminal-vibe) czy podpinać prawdziwe loga z API?
- **Density** — średnia. Jeśli chcesz "bardziej Bloomberg" (gęsto), zmniejsz padding tabel z 14px do 8-10px i font do 12.5px.
- **Mobile breakpoints** — wymaga osobnej rundy projektowej.
