---
name: tabs-redesign-design
description: Redesign Dashboard (Variant A Refined) i Portfel (Variant B Bold) na podstawie tabs_handoff/prototype/ — nowe komponenty CSS, KpiPro, InsightStrip, StackedAllocation, WinnersLosers
metadata:
  type: project
---

# Design: myfund — Redesign Dashboard + Portfel

**Ref. prototyp:** `tabs_handoff/prototype/` (Dashboard A, Portfel B)
**Scope:** Desktop only. Mobile drawer bez zmian.
**Zasada:** Wyłącznie warstwa wizualna — logika danych bez zmian.

---

## 1. Architektura

### 1.1 CSS — `src/tabs.css`
Nowy plik CSS przeportowany z `tabs_handoff/prototype/tabs.css`.
Importowany w `src/main.jsx` po `src/index.css`.

Zawiera style dla nowych klas:
- `.kpi-pro` / `.kpi-pro.hero` / `.chip-sm`
- `.insight-strip` / `.insight`
- `.stack-alloc` / `.stack-bar` / `.stack-seg` / `.stack-legend`
- `.wl-list` / `.wl-row` / `.wl-track` / `.wl-fill`
- `.chip-filter` / `.sec-label`
- `.rail-stats` / `.rail-stat`
- `.table tfoot` / `.sector-group`
- Container queries `@container app (max-width: …)` (reagują na szerokość kontenera treści)

### 1.2 Nowe komponenty shared

| Plik | Props | Odpowiada |
|---|---|---|
| `src/components/shared/KpiPro.jsx` | label, value, chip, chipUp, sub, icon, spark, sparkUp, hero, tone | `KpiPro` z tabs-dashboard.jsx |
| `src/components/shared/InsightStrip.jsx` | positions (enriched), dailyChangePLN | `InsightStrip` z tabs-dashboard.jsx |
| `src/components/shared/StackedAllocation.jsx` | positions, totalValue | `StackedAllocation` z tabs-dashboard.jsx |
| `src/components/shared/WinnersLosers.jsx` | positions, onOpenDetail? | `WinnersLosers` z tabs-dashboard.jsx |

**Kolory sektorów** (stałe w komponentach):
```js
const SECTOR_COLORS = {
  Tech: "#7c9eff", Gaming: "#a78bfa", Energy: "#ffb020",
  Retail: "#34d399", Auto: "#ff4d6d", Finance: "#22d3ee",
  Health: "#f472b6", Construction: "#fb923c", Food: "#facc15",
  Inne: "#8a929d",
};
```
Pole sektora pochodzi z `pos.sector` (już enrichowane przez `enrichPosition`).

---

## 2. Dashboard — Variant A · Refined

**Plik:** `src/pages/Dashboard.jsx`

### 2.1 Co znika
- `KpiCard` komponent i siatka z `repeat(auto-fit, minmax(140px, 1fr))`
- `CashSection` card
- `AllocationChart` (donut, react-chartjs-2)
- Karty "Najlepsze dziś / Najsłabsze dziś"
- Sparkline historia osobny Card (dane sparkline przeniesione do KpiPro hero)

### 2.2 Nowy layout JSX
```
<div className="space-y-0">
  {/* page-head */}
  <div className="page-header">
    <h1>Witaj, {displayName}</h1>
    <p>{data} · sesja [dot-status]</p>
  </div>

  <InsightStrip positions={allPositions} dailyChangePLN={dailyChange.pln} />

  <div className="kpi-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, margin:'18px 0' }}>
    <KpiPro hero label="Wartość portfela" value={fmt(kpi.totalValue,0)+" zł"}
      chip={dailyChange.pct} chipUp={dailyChange.pln>=0}
      sub="dziś" icon={<svg…/>} spark={kpi.sparkValues.slice(-24)} sparkUp={dailyChange.pln>=0} />
    <KpiPro label="Zysk / strata" tone={kpi.unrealPLN>=0?"up":"down"}
      value={(kpi.unrealPLN>=0?"+":"")+fmt(kpi.unrealPLN,0)+" zł"}
      chip={kpi.unrealPct} chipUp={kpi.unrealPLN>=0} sub="niezrealizowany" icon={…} … />
    <KpiPro label="Dywidendy YTD"
      value={fmt(kpi.annualDivPLN,0)+" zł"}
      chip="+%" sub={nextDividend ? "następna: "+nextDividend.symbol : "brak"} icon={…} … />
    <KpiPro label="Wolne środki"
      value={fmt(kpi.cashValue,0)+" zł"}
      chip={portfolioIrr ? (portfolioIrr*100).toFixed(1)+"%/r" : "N/A"} sub="konto · PLN" icon={…} … />
  </div>

  <div className="detail-grid" style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:16 }}>
    <div className="card chart-card">
      {/* chart-head z TimeframeSeg → filtruje snapshots */}
      <HistoryChart data={snapshotsFiltered} />
    </div>
    <div className="card">
      {/* "Top ruchy dzisiaj" — istniejące topMovers */}
    </div>
  </div>

  <div style={{height:18}}/>

  <div className="detail-grid" style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:16 }}>
    <div className="card">
      {/* Alokacja sektorowa */}
      <StackedAllocation positions={allPositions} totalValue={kpi.positionsValue} />
    </div>
    <div className="card">
      {/* Wygrani i przegrani */}
      <WinnersLosers positions={allPositions} />
    </div>
  </div>
</div>
```

### 2.3 TimeframeSeg — filtrowanie snapshots
Prosty segment kontrolki: `["1T","1M","3M","6M","1R","MAX"]`.
Filtruje `snapshots` po dacie (np. 1M = ostatnie 30 dni). Dane przekazywane do `HistoryChart`.

### 2.4 Dane dla InsightStrip
```js
const best  = allPositions.filter(p => p.plPct != null).sort((a,b) => b.plPct - a.plPct)[0];
const worst = allPositions.filter(p => p.plPct != null).sort((a,b) => a.plPct - b.plPct)[0];
const mover = allPositions.filter(p => p.dailyChg != null).sort((a,b) => Math.abs(b.dailyChg)-Math.abs(a.dailyChg))[0];
// wynik dnia: dailyChange.pln
```
`plPct` = `pos.plPLN / pos.costPLN * 100` — obliczony w `enrichPosition` lub inline.

---

## 3. Portfel — Variant B · Bold

**Plik:** `src/pages/Portfolio.jsx`

### 3.1 Co zostaje bez zmian
Wszystkie modale (AddStock, SellStock, EditPosition, AddDividend, BrokerImport, CSV),
logika CRUD, kolumny, column picker, sortowanie.

### 3.2 Nowa sekcja nad tabelą
```
<div className="detail-grid" style={{ gridTemplateColumns:"1fr 340px", marginBottom:16 }}>
  <div className="card chart-card">
    {/* chart-head: wartość + zwrot + TimeframeSeg */}
    <HistoryChart data={snapshotsFiltered} />
  </div>
  <div className="hero-side" style={{ display:'flex', flexDirection:'column', gap:16 }}>
    <div className="card">
      {/* rail-stats: Koszt zakupu, Wynik dnia, Wolne środki */}
      {/* Beta → "N/A" (brak danych) */}
    </div>
    <div className="card" style={{flex:1}}>
      {/* Alokacja — StackedAllocation */}
    </div>
  </div>
</div>
```

### 3.3 Sekcja tabeli
```
<div className="card">
  <div className="card-head">
    <div className="card-title">Pozycje · {n}</div>
    <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
      {/* chip-filtry: Wszystkie / Zyskowne / Stratne / GPW */}
      {/* toggle: Grupuj sektorami */}
      {/* istniejące: ColumnPicker, Eksport, Dodaj */}
    </div>
  </div>
  {/* istniejąca tabela + nowe: */}
  {/* - sector-group wiersze gdy grouped=true */}
  {/* - tfoot z sumami (wartość, P&L, zwrot%, 100%) */}
  {/* - chip-sm w kolumnie zwrotu */}
</div>
```

### 3.4 Dane dla rail-stats (Portfolio)
- Koszt zakupu: `invested` (z AppContext)
- Wynik dnia: `dailyChange.pln` (obliczony z allPositions)
- Wolne środki: `cashValue` (z AppContext cash + fxRates)
- Beta: "N/A" (brak w obecnych danych)

### 3.5 Filtrowanie pozycji
```js
const filtered = useMemo(() => {
  if (filterChip === "win")  return allPositions.filter(p => (p.plPLN ?? 0) >= 0);
  if (filterChip === "lose") return allPositions.filter(p => (p.plPLN ?? 0) < 0);
  if (filterChip === "gpw")  return allPositions.filter(p => p.symbol.endsWith(".WA"));
  return allPositions;
}, [allPositions, filterChip]);
```

### 3.6 Sektor-grupowanie
Stan `grouped` (boolean), domyślnie `false`.
Gdy `true`: pozycje grupowane po `pos.sector`, nagłówki `sector-group`.
Sortowanie wewnątrz grupy po wartości malejąco.

### 3.7 Totals row (tfoot)
```js
const totals = filtered.reduce((a,p) => ({
  value: a.value + (p.valuePLN ?? 0),
  pl:    a.pl    + (p.plPLN ?? 0),
  cost:  a.cost  + (p.costPLN ?? 0),
}), { value:0, pl:0, cost:0 });
```
Wyświetlona w `<tfoot>` z klasą `.table tfoot`.

---

## 4. Decyzje techniczne

| Decyzja | Wybór | Uzasadnienie |
|---|---|---|
| CSS organizacja | Osobny `src/tabs.css` | Zgodnie z wzorcem prototypu, łatwy diff |
| Wykres portfolio | `HistoryChart` z snapshots | Jedyne dostępne dane historyczne |
| Świece (Portfolio) | Przycisk disabled/ukryty | Brak OHLC danych w aplikacji |
| Kolory sektorów | Stałe w komponentach (nie CSS vars) | Zgodnie z prototypem |
| Container queries | `style={{ containerType:'inline-size' }}` na `<main>` w Layout.jsx | Element bez klasy — inline style zamiast nowej klasy CSS |
| TimeframeSeg | Użyj istniejącego `SegmentedControl` z `components/shared/` | Nie tworzyć nowego komponentu |
| `plPct` w InsightStrip | Obliczony jako `plPLN/costPLN*100` | `enrichPosition` już to dostarcza |

---

## 5. Pliki do modyfikacji / tworzenia

**Nowe:**
- `src/tabs.css`
- `src/components/shared/KpiPro.jsx`
- `src/components/shared/InsightStrip.jsx`
- `src/components/shared/StackedAllocation.jsx`
- `src/components/shared/WinnersLosers.jsx`

**Modyfikowane:**
- `src/main.jsx` (dodaj import tabs.css)
- `src/pages/Dashboard.jsx` (pełny rewrite JSX return)
- `src/pages/Portfolio.jsx` (dodaj sekcję chart+rail, filter chips, grouping, tfoot)
- `src/components/layout/Layout.jsx` (dodaj `container-type: inline-size` na `.app-main`)
