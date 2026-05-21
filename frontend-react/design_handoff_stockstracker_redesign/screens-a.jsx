/* screens-a.jsx — Dashboard, Portfolio, Holdings */

const TF = ["1D", "1T", "1M", "3M", "1R", "YTD", "MAX"];

function TimeframeSeg({ value, onChange }) {
  return (
    <div className="seg">
      {TF.map(t => (
        <button key={t} className={value === t ? "active" : ""} onClick={() => onChange(t)}>{t}</button>
      ))}
    </div>
  );
}

/* ============================================
   DASHBOARD
   ============================================ */
function Dashboard({ setView, setDetail }) {
  const P = useMemo(() => MyFund.computePortfolio(), []);
  const [tf, setTf] = useState("1M");
  const series = useMemo(() => {
    const n = { "1D": 30, "1T": 50, "1M": 60, "3M": 90, "1R": 120, "YTD": 100, "MAX": 200 }[tf];
    return MyFund.genSeries(42, n, P.totalValue * 0.88, P.totalValue * 0.02);
  }, [tf, P.totalValue]);
  const topMovers = [...P.positions].sort((a, b) => Math.abs(b.d1) - Math.abs(a.d1)).slice(0, 5);
  const bestHoldings = [...P.positions].sort((a, b) => b.plPct - a.plPct).slice(0, 4);
  const worstHoldings = [...P.positions].sort((a, b) => a.plPct - b.plPct).slice(0, 3);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Witaj z powrotem, Adam</h1>
          <div className="page-sub">Czwartek, 21 maja 2026 · sesja otwarta · GPW, NYSE, LSE</div>
        </div>
        <div className="row gap-8">
          <button className="btn">{Ico.dl} Eksport CSV</button>
          <button className="btn">{Ico.filter} Filtry</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <Kpi label="Wartość portfela" value={fmtPLN(P.totalValue, 2)} chip={fmtPctChip(P.dayChangePct)} chipUp={P.dayChangePct >= 0} sub={"Dzień: " + (P.dayChange >= 0 ? "+" : "") + fmt(P.dayChange, 0) + " zł"} />
        <Kpi label="Zysk/strata" value={(P.totalPL >= 0 ? "+" : "") + fmt(P.totalPL, 0) + " zł"} chip={fmtPctChip(P.totalPLPct)} chipUp={P.totalPLPct >= 0} sub={"Koszt zakupu: " + fmt(P.totalCost, 0) + " zł"} valueClass={P.totalPL >= 0 ? "up" : "down"} />
        <Kpi label="Dywidendy YTD" value="2 184 zł" chip="+12.4%" chipUp={true} sub="Najbliższa: AAPL · 22 maj" />
        <Kpi label="Wolne środki" value="14 280 zł" chip="3.62% / rok" chipUp={true} sub="Konto maklerskie · PLN" />
      </div>

      <div className="detail-grid" style={{ gridTemplateColumns: "1fr 380px" }}>
        <div className="card chart-card">
          <div className="chart-head">
            <div className="chart-figures">
              <div className="dim" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.1em" }}>Wartość portfela · {tf}</div>
              <div className="chart-value">{fmtPLN(series[series.length - 1], 0)}</div>
              <div className="chart-delta">
                <span className={"chip " + (series[series.length - 1] >= series[0] ? "up" : "down")}>
                  {fmtPctChip(((series[series.length - 1] - series[0]) / series[0]) * 100)}
                </span>
                <span className="dim">vs. {fmt(series[0], 0)} zł na początku okresu</span>
              </div>
            </div>
            <TimeframeSeg value={tf} onChange={setTf} />
          </div>
          <div style={{ padding: "0 12px 18px" }}>
            <AreaChart data={series} height={280} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Top ruchy dzisiaj</div>
            <span className="dim" style={{ fontSize: 11 }}>live · 17:42</span>
          </div>
          <div className="card-body row-list">
            {topMovers.map(p => (
              <div className="row-item" key={p.sym} onClick={() => { setDetail(p.sym); setView("detail"); }}>
                <div className="ticker-logo">{p.sym.slice(0, 2)}</div>
                <div className="grow">
                  <div className="ticker-name">{p.sym}</div>
                  <div className="ticker-sub">{p.name}</div>
                </div>
                <Sparkline data={MyFund.genSeries(p.sym.charCodeAt(0) * 7, 24, 100, 5)} width={70} height={26} />
                <div style={{ textAlign: "right", minWidth: 60 }}>
                  <div className={"num " + (p.d1 >= 0 ? "up" : "down")}>{fmtPct(p.d1)}</div>
                  <div className="ticker-sub num">{fmt(p.price, 2)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: 18 }}></div>

      {/* Allocation + Best/Worst */}
      <div className="detail-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <AllocationCard positions={P.positions} totalValue={P.totalValue} />
        <BestWorstCard title="Najlepsze pozycje" list={bestHoldings} setView={setView} setDetail={setDetail} />
        <BestWorstCard title="Pod presją" list={worstHoldings} setView={setView} setDetail={setDetail} />
      </div>
    </div>
  );
}

function Kpi({ label, value, chip, chipUp, sub, valueClass }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={"kpi-value " + (valueClass || "")}>{value}</div>
      <div className="kpi-sub">
        {chip && <span className={"chip " + (chipUp ? "up" : "down")}>{chip}</span>}
        <span>{sub}</span>
      </div>
    </div>
  );
}

const SECTOR_COLORS = {
  Tech: "#7c9eff", Gaming: "#a78bfa", Energy: "#ffb020", Retail: "#00d97e", Auto: "#ff4d6d", Finance: "#22d3ee",
};

function AllocationCard({ positions, totalValue }) {
  const bySector = {};
  positions.forEach(p => {
    bySector[p.sector] = (bySector[p.sector] || 0) + p.value;
  });
  const slices = Object.entries(bySector).map(([k, v]) => ({
    label: k, value: v, color: SECTOR_COLORS[k] || "#7c9eff",
  }));
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Alokacja sektorowa</div>
        <span className="tag">Sektory</span>
      </div>
      <div className="card-body" style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <Donut slices={slices} size={150} thickness={20} />
        <div className="donut-legend grow">
          {slices.map((s, i) => (
            <div className="legend-row" key={i}>
              <span className="legend-sw" style={{ background: s.color }}></span>
              <span>{s.label}</span>
              <span className="num dim">{((s.value / totalValue) * 100).toFixed(1)}%</span>
              <span className="num">{fmt(s.value / 1000, 1)}k</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BestWorstCard({ title, list, setView, setDetail }) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">{title}</div>
      </div>
      <div className="card-body row-list">
        {list.map(p => (
          <div className="row-item" key={p.sym} onClick={() => { setDetail(p.sym); setView("detail"); }}>
            <div className="ticker-logo">{p.sym.slice(0, 2)}</div>
            <div className="grow">
              <div className="ticker-name">{p.sym}</div>
              <div className="ticker-sub">{p.qty} szt · śr. {fmt(p.avg, 2)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className={"num " + (p.plPct >= 0 ? "up" : "down")}>{fmtPct(p.plPct)}</div>
              <div className="ticker-sub num">{(p.pl >= 0 ? "+" : "") + fmt(p.pl, 0)} zł</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================
   PORTFOLIO
   ============================================ */
function Portfolio({ setView, setDetail }) {
  const P = useMemo(() => MyFund.computePortfolio(), []);
  const [tf, setTf] = useState("3M");
  const [view2, setView2] = useState("line"); // line | candles | heatmap
  const series = useMemo(() => {
    const n = { "1D": 24, "1T": 7, "1M": 30, "3M": 90, "1R": 180, "YTD": 140, "MAX": 240 }[tf];
    return MyFund.genSeries(11, n, P.totalValue * 0.85, P.totalValue * 0.025);
  }, [tf, P.totalValue]);

  // candles
  const candles = useMemo(() => {
    const arr = [];
    let v = P.totalValue * 0.9;
    let rng = 17;
    const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
    for (let i = 0; i < 32; i++) {
      const o = v;
      const c = v + (rand() - 0.48) * v * 0.025;
      const h = Math.max(o, c) + rand() * v * 0.01;
      const l = Math.min(o, c) - rand() * v * 0.01;
      arr.push({ o, h, l, c });
      v = c;
    }
    return arr;
  }, [P.totalValue]);

  const heatItems = P.positions.map(p => ({
    sym: p.sym, d1: p.d1, value: p.value,
    span: p.value > P.totalValue * 0.1 ? 2 : 1,
  }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Portfolio</h1>
          <div className="page-sub">10 pozycji · 2 waluty · zaktualizowano 17:42:08</div>
        </div>
        <div className="row gap-8">
          <button className="btn">{Ico.star} Snapshot</button>
          <button className="btn">{Ico.dl} Eksport</button>
          <button className="btn primary">{Ico.plus} Dodaj transakcję</button>
        </div>
      </div>

      <div className="card chart-card mb-16">
        <div className="chart-head">
          <div className="chart-figures">
            <div className="dim" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.1em" }}>Wartość portfela</div>
            <div className="chart-value">{fmtPLN(P.totalValue, 2)}</div>
            <div className="chart-delta">
              <span className={"chip " + (P.totalPL >= 0 ? "up" : "down")}>{fmtPctChip(P.totalPLPct)}</span>
              <span className="num" style={{ color: P.totalPL >= 0 ? "var(--up)" : "var(--down)" }}>
                {P.totalPL >= 0 ? "+" : ""}{fmt(P.totalPL, 2)} zł
              </span>
              <span className="dim">całkowity zysk</span>
            </div>
          </div>
          <div className="col gap-8" style={{ alignItems: "flex-end" }}>
            <TimeframeSeg value={tf} onChange={setTf} />
            <div className="seg">
              <button className={view2 === "line" ? "active" : ""} onClick={() => setView2("line")}>LINIA</button>
              <button className={view2 === "candles" ? "active" : ""} onClick={() => setView2("candles")}>ŚWIECE</button>
              <button className={view2 === "heatmap" ? "active" : ""} onClick={() => setView2("heatmap")}>HEATMAP</button>
            </div>
          </div>
        </div>
        <div style={{ padding: "0 12px 18px" }}>
          {view2 === "line" && <AreaChart data={series} height={320} />}
          {view2 === "candles" && <CandleChart data={candles} height={320} />}
          {view2 === "heatmap" && <div style={{ padding: 12 }}><Heatmap items={heatItems} /></div>}
        </div>
      </div>

      <HoldingsTable positions={P.positions} setView={setView} setDetail={setDetail} totalValue={P.totalValue} />
    </div>
  );
}

/* ============================================
   HOLDINGS table (also used inside Portfolio + Holdings page)
   ============================================ */
function HoldingsTable({ positions, setView, setDetail, totalValue }) {
  const [sort, setSort] = useState({ key: "value", dir: "desc" });
  const sorted = [...positions].sort((a, b) => {
    const d = a[sort.key] > b[sort.key] ? 1 : -1;
    return sort.dir === "asc" ? d : -d;
  });
  const headers = [
    { key: "sym", label: "Aktywo" },
    { key: "qty", label: "Ilość", right: true },
    { key: "avg", label: "Śr. kurs", right: true },
    { key: "price", label: "Kurs", right: true },
    { key: "d1", label: "Dzień", right: true },
    { key: "value", label: "Wartość", right: true },
    { key: "pl", label: "Zysk/strata", right: true },
    { key: "plPct", label: "Zwrot %", right: true },
    { key: "w", label: "Udział", right: true },
    { key: "spark", label: "30D" },
  ];
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Pozycje · {positions.length}</div>
        <div className="row gap-8">
          <button className="btn ghost">{Ico.filter} Filtr</button>
          <div className="seg">
            <button className="active">Wszystkie</button>
            <button>PL</button>
            <button>US</button>
          </div>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              {headers.map(h => (
                <th key={h.key} className={h.right ? "right" : ""} onClick={() => setSort({ key: h.key, dir: sort.key === h.key && sort.dir === "desc" ? "asc" : "desc" })} style={{ cursor: "pointer" }}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.sym} onClick={() => { setDetail(p.sym); setView("detail"); }}>
                <td>
                  <div className="ticker-cell">
                    <div className="ticker-logo">{p.sym.slice(0, 2)}</div>
                    <div>
                      <div className="ticker-name">{p.sym}</div>
                      <div className="ticker-sub">{p.name} · {p.cur}</div>
                    </div>
                  </div>
                </td>
                <td className="right num">{p.qty}</td>
                <td className="right num dim">{fmt(p.avg, 2)}</td>
                <td className="right num">{fmt(p.price, 2)}</td>
                <td className="right"><span className={"num " + (p.d1 >= 0 ? "up" : "down")}>{fmtPct(p.d1)}</span></td>
                <td className="right num">{fmt(p.value, 0)} zł</td>
                <td className="right"><span className={"num " + (p.pl >= 0 ? "up" : "down")}>{(p.pl >= 0 ? "+" : "") + fmt(p.pl, 0)} zł</span></td>
                <td className="right"><span className={"chip " + (p.plPct >= 0 ? "up" : "down")}>{fmtPctChip(p.plPct)}</span></td>
                <td className="right">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                    <span className="num dim" style={{ fontSize: 11 }}>{((p.value / totalValue) * 100).toFixed(1)}%</span>
                    <div className="alloc-bar" style={{ width: 60 }}>
                      <span style={{ width: ((p.value / totalValue) * 100 * 3) + "%", maxWidth: "100%" }}></span>
                    </div>
                  </div>
                </td>
                <td><Sparkline data={MyFund.genSeries(p.sym.charCodeAt(0) * 7, 24, 100, 5)} width={84} height={28} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Holdings({ setView, setDetail }) {
  const P = useMemo(() => MyFund.computePortfolio(), []);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Pozycje</h1>
          <div className="page-sub">Wszystkie aktywne pozycje w portfelu · sortowanie po dowolnej kolumnie</div>
        </div>
        <div className="row gap-8">
          <button className="btn">{Ico.dl} Eksport CSV</button>
          <button className="btn primary">{Ico.plus} Nowa pozycja</button>
        </div>
      </div>
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Kpi label="Łączna wartość" value={fmtPLN(P.totalValue, 0)} chip={fmtPctChip(P.dayChangePct)} chipUp={P.dayChangePct >= 0} sub="zaktualizowano 17:42" />
        <Kpi label="Pozycji" value={String(P.positions.length)} sub="2 waluty · 5 sektorów" />
        <Kpi label="Średni zwrot" value={fmtPct(P.totalPLPct)} valueClass={P.totalPLPct >= 0 ? "up" : "down"} sub="ważony wartością" />
        <Kpi label="Beta portfela" value="1.18" sub="vs. WIG30" chip="MED. RYZYKO" chipUp={true} />
      </div>
      <HoldingsTable positions={P.positions} setView={setView} setDetail={setDetail} totalValue={P.totalValue} />
    </div>
  );
}

Object.assign(window, { Dashboard, Portfolio, Holdings, HoldingsTable, Kpi, TimeframeSeg });
