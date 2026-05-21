/* screens-c.jsx — History, Dividends, Calendar, Scenario Lab, Attribution */

/* ============================================
   HISTORIA WARTOŚCI
   ============================================ */
function History() {
  const P = useMemo(() => MyFund.computePortfolio(), []);
  const [tf, setTf] = useState("MAX");
  const [bench, setBench] = useState("none");
  const n = { "1M": 30, "3M": 90, "6M": 180, "1R": 240, "MAX": 240 }[tf];
  const series = useMemo(() => {
    const arr = MyFund.genSeries(7, n, P.totalValue * 0.45, P.totalValue * 0.06);
    // simulate spike pattern from screenshot
    return arr.map((v, i) => i < 4 ? v * 0.5 : (i > n - 3 ? v * 0.3 : v));
  }, [n, P.totalValue]);
  const invested = useMemo(() => MyFund.genSeries(11, n, P.totalCost * 0.6, P.totalCost * 0.015), [n, P.totalCost]);
  const benchmark = useMemo(() => MyFund.genSeries(33, n, P.totalValue * 0.5, P.totalValue * 0.04), [n, P.totalValue]);

  const ath = Math.max(...series);
  const athIdx = series.indexOf(ath);
  const startDate = new Date("2026-01-15");
  const dateOf = i => {
    const d = new Date(startDate); d.setDate(d.getDate() + i); return d;
  };

  const snapshots = [];
  for (let i = series.length - 1; i >= series.length - 8; i--) {
    if (i < 0) break;
    const d = dateOf(i);
    snapshots.push({
      date: d.toLocaleDateString("pl-PL"),
      value: series[i],
      invested: invested[i],
      pl: series[i] - invested[i],
      plPct: ((series[i] - invested[i]) / invested[i]) * 100,
      drawdown: ((series[i] - ath) / ath) * 100,
    });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Historia wartości</h1>
          <div className="page-sub">Snapshoty portfela · porównanie z benchmarkami · drawdowny</div>
        </div>
        <button className="btn">{Ico.dl} Eksport snapshots</button>
      </div>

      <div className="kpi-grid">
        <Kpi label="Aktualna wartość" value={fmt(P.totalValue, 0) + " zł"} chip={fmtPctChip(P.dayChangePct)} chipUp={P.dayChangePct >= 0} sub="dzień" />
        <Kpi label="Zainwestowano" value={fmt(P.totalCost, 0) + " zł"} sub="koszt zakupu" />
        <Kpi label="Zmiana od początku" value={(P.totalPL >= 0 ? "+" : "") + fmt(P.totalPL, 0) + " zł"} chip={fmtPctChip(P.totalPLPct)} chipUp={P.totalPL >= 0} valueClass={P.totalPL >= 0 ? "up" : "down"} sub="od pierwszego zakupu" />
        <Kpi label="ATH (szczyt)" value={fmt(ath, 0) + " zł"} chip={fmtPctChip(((P.totalValue - ath) / ath) * 100)} chipUp={false} sub={dateOf(athIdx).toLocaleDateString("pl-PL")} />
      </div>

      <div className="card chart-card mb-16">
        <div className="chart-head">
          <div className="chart-figures">
            <div className="dim" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.1em" }}>Historia wartości portfela · {tf}</div>
            <div className="chart-value">{fmt(P.totalValue, 0)} <span style={{ fontSize: 16, color: "var(--text-dim)" }}>zł</span></div>
            <div className="row gap-12 mt-8 center" style={{ fontSize: 12 }}>
              <div className="row gap-8 center">
                <span style={{ width: 14, height: 2, background: "var(--up)" }}></span>
                <span className="dim">Wartość portfela</span>
              </div>
              <div className="row gap-8 center">
                <span style={{ width: 14, height: 2, background: "var(--text-faint)", borderTop: "2px dashed" }}></span>
                <span className="dim">Zainwestowano</span>
              </div>
              {bench !== "none" && (
                <div className="row gap-8 center">
                  <span style={{ width: 14, height: 2, background: "var(--info)" }}></span>
                  <span className="dim">{bench}</span>
                </div>
              )}
            </div>
          </div>
          <div className="col gap-8" style={{ alignItems: "flex-end" }}>
            <div className="seg">
              {["1M", "3M", "6M", "1R", "MAX"].map(t => (
                <button key={t} className={tf === t ? "active" : ""} onClick={() => setTf(t)}>{t}</button>
              ))}
            </div>
            <div className="row gap-8 center">
              <span className="dim" style={{ fontSize: 11 }}>Benchmark:</span>
              <div className="seg">
                {[["none", "Brak"], ["sp500", "S&P 500"], ["wig20", "WIG20"], ["msci", "MSCI World"]].map(([k, l]) => (
                  <button key={k} className={bench === k ? "active" : ""} onClick={() => setBench(k)}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: "0 12px 18px" }}>
          {bench === "none"
            ? <AreaChartWithLine main={series} secondary={invested} height={320} />
            : <DualLine a={series} b={benchmark} />
          }
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Wszystkie snapshots · {snapshots.length}</div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th className="right">Wartość</th>
              <th className="right">Zainwestowano</th>
              <th className="right">P&L</th>
              <th className="right">Zwrot</th>
              <th className="right">Drawdown</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s, i) => (
              <tr key={i}>
                <td className="num dim">{s.date}</td>
                <td className="right num">{fmt(s.value, 0)} zł</td>
                <td className="right num dim">{fmt(s.invested, 0)} zł</td>
                <td className="right"><span className={"num " + (s.pl >= 0 ? "up" : "down")}>{(s.pl >= 0 ? "+" : "") + fmt(s.pl, 0)} zł</span></td>
                <td className="right"><span className={"chip " + (s.plPct >= 0 ? "up" : "down")}>{fmtPctChip(s.plPct)}</span></td>
                <td className="right num down">{fmtPct(s.drawdown, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AreaChartWithLine({ main, secondary, height = 280 }) {
  const ref = useRef(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => setW(ref.current.clientWidth));
    ro.observe(ref.current); setW(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);
  const all = [...main, ...secondary];
  const min = Math.min(...all), max = Math.max(...all);
  const range = (max - min) || 1;
  const pad = 30, innerH = height - pad * 2;
  function pts(arr) {
    return arr.map((v, i) => [
      (i / (arr.length - 1)) * (w - pad * 2) + pad,
      pad + innerH - ((v - min) / range) * innerH,
    ]);
  }
  const a = pts(main), b = pts(secondary);
  const dA = a.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const dB = b.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={w} height={height} className="chart-svg">
        <defs>
          <linearGradient id="histgrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--up)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--up)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0,1,2,3,4].map(i => {
          const y = pad + (innerH / 4) * i;
          const v = max - (range / 4) * i;
          return (
            <g key={i}>
              <line x1={pad} x2={w - pad} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 4" opacity="0.5" />
              <text x={w - pad + 6} y={y + 4} fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-faint)">{fmt(v / 1000, 0)}k</text>
            </g>
          );
        })}
        <path d={`${dA} L${w - pad},${height - pad} L${pad},${height - pad} Z`} fill="url(#histgrad)" />
        <path d={dA} fill="none" stroke="var(--up)" strokeWidth="2" />
        <path d={dB} fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.65" />
      </svg>
    </div>
  );
}

/* ============================================
   DYWIDENDY
   ============================================ */
function Dividends() {
  const [mode, setMode] = useState("brutto");
  const upcoming = [
    { sym: "XTB.WA", name: "XTB S.A.",       date: "2026-06-04", amount: 4.20, yield: 3.92, status: "ZAPOWIEDZIANA" },
    { sym: "DNP.WA", name: "Dino Polska",    date: "2026-06-18", amount: 1.80, yield: 0.57, status: "ZATWIERDZONA" },
    { sym: "CDR.WA", name: "CD Projekt",     date: "2026-07-02", amount: 1.10, yield: 0.43, status: "ZAPOWIEDZIANA" },
  ];
  const history = [
    { sym: "XTB.WA", date: "2025-06-12", per: 3.80,  qty: 36,  total: 136.80,  status: "Wypłacone" },
    { sym: "DNP.WA", date: "2025-06-30", per: 1.50,  qty: 313, total: 469.50,  status: "Wypłacone" },
    { sym: "CDR.WA", date: "2025-07-15", per: 1.00,  qty: 8,   total: 8.00,    status: "Wypłacone" },
    { sym: "DIA.WA", date: "2025-09-20", per: 4.20,  qty: 24,  total: 100.80,  status: "Wypłacone" },
  ];
  const totalGross = 715.10;
  const yoc = [
    { sym: "XTB.WA", yoc: 3.80, yield: 3.92, paid: 136.80 },
    { sym: "DNP.WA", yoc: 4.55, yield: 0.57, paid: 469.50 },
    { sym: "DIA.WA", yoc: 2.64, yield: 2.60, paid: 100.80 },
    { sym: "CDR.WA", yoc: 0.42, yield: 0.43, paid: 8.00 },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Kalendarz Dywidend</h1>
          <div className="page-sub">Nadchodzące wypłaty, historia, Yield on Cost · GPW manualnie, US z Finnhub</div>
        </div>
        <div className="row gap-8">
          <div className="seg">
            <button className={mode === "brutto" ? "active" : ""} onClick={() => setMode("brutto")}>BRUTTO</button>
            <button className={mode === "netto" ? "active" : ""} onClick={() => setMode("netto")}>NETTO</button>
          </div>
          <button className="btn primary">{Ico.plus} Dodaj dywidendę</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <Kpi label={"Dywidendy 12 mies. · " + mode.toUpperCase()} value={fmtPLN(totalGross * (mode === "netto" ? 0.81 : 1), 2)} valueClass="up" sub="vs. 412 zł rok wcześniej" chip="+73.5%" chipUp={true} />
        <Kpi label="Yield portfela (proj.)" value="2.84%" sub="roczne dywidendy / wartość portfela" chip="3 nowe" chipUp={true} />
        <Kpi label="Nadchodzące (30 dni)" value={String(upcoming.filter(u => new Date(u.date) <= new Date("2026-06-19")).length)} sub={"Najbliższa: XTB.WA · 4 czerwca · " + fmt(151.20, 2) + " zł"} />
      </div>

      <div className="card mb-16">
        <div className="card-head">
          <div className="card-title">Nadchodzące dywidendy · {upcoming.length}</div>
          <span className="dim" style={{ fontSize: 11 }}>kolejne 90 dni</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Spółka</th>
              <th>Dzień wypłaty</th>
              <th>Status</th>
              <th className="right">Stawka / szt.</th>
              <th className="right">Yield</th>
              <th className="right">Twoja wypłata</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((u, i) => {
              const myQty = (MyFund.POSITIONS.find(p => p.sym === u.sym) || {}).qty || 0;
              const my = myQty * u.amount * (mode === "netto" ? 0.81 : 1);
              return (
                <tr key={i}>
                  <td>
                    <div className="ticker-cell">
                      <div className="ticker-logo">{u.sym.slice(0, 2)}</div>
                      <div>
                        <div className="ticker-name">{u.sym}</div>
                        <div className="ticker-sub">{u.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="num">{u.date}</td>
                  <td><span className={"tag " + (u.status === "ZATWIERDZONA" ? "buy" : "")}>{u.status}</span></td>
                  <td className="right num">{fmt(u.amount, 2)} zł</td>
                  <td className="right num up">{u.yield.toFixed(2)}%</td>
                  <td className="right num" style={{ fontWeight: 600 }}>{fmt(my, 2)} zł</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="detail-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <div className="card-head"><div className="card-title">Yield on Cost per spółka</div></div>
          <table className="table">
            <thead>
              <tr>
                <th>Spółka</th>
                <th className="right">YoC %</th>
                <th className="right">Bieżący Yield</th>
                <th className="right">Wypłacone (12m)</th>
              </tr>
            </thead>
            <tbody>
              {yoc.map((y, i) => (
                <tr key={i}>
                  <td><div className="ticker-cell"><div className="ticker-logo" style={{ width: 26, height: 26, fontSize: 10 }}>{y.sym.slice(0,2)}</div><span className="ticker-name" style={{ fontSize: 13 }}>{y.sym}</span></div></td>
                  <td className="right num up">{y.yoc.toFixed(2)}%</td>
                  <td className="right num dim">{y.yield.toFixed(2)}%</td>
                  <td className="right num">{fmt(y.paid, 2)} zł</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">Historia wypłat · {history.length}</div></div>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Spółka</th>
                <th className="right">/ szt.</th>
                <th className="right">Razem</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="num dim">{h.date}</td>
                  <td><span className="ticker-name" style={{ fontSize: 13 }}>{h.sym}</span></td>
                  <td className="right num">{fmt(h.per, 2)}</td>
                  <td className="right num up">{fmt(h.total, 2)} zł</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================================
   KALENDARZ
   ============================================ */
function Calendar() {
  const [month] = useState(new Date(2026, 4, 1)); // May 2026
  const [filter, setFilter] = useState("all");
  const [imp, setImp] = useState("all");

  const events = {
    "2026-05-13": [{ t: "US CPI (kwiecień)",        c: "USD", imp: "high",   k: "macro" }],
    "2026-05-14": [
      { t: "US PPI MoM",                            c: "USD", imp: "medium", k: "macro" },
      { t: "Dywidenda XTB.WA",                      c: "PLN", imp: "medium", k: "div" },
    ],
    "2026-05-20": [{ t: "Wyniki CDR.WA — Q1 2026",  c: "PLN", imp: "high",   k: "earnings" }],
    "2026-05-21": [{ t: "EBC: decyzja w sprawie stóp", c: "EUR", imp: "high", k: "macro" }],
    "2026-05-28": [{ t: "FOMC: protokół",           c: "USD", imp: "high",   k: "macro" }],
    "2026-05-30": [{ t: "Wyniki DNP.WA",            c: "PLN", imp: "medium", k: "earnings" }],
  };

  const monthName = month.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
  const firstDay = new Date(month);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  // Monday-first
  const startOffset = (firstDay.getDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < startOffset; i++) {
    const d = new Date(firstDay); d.setDate(d.getDate() - (startOffset - i));
    days.push({ d, dim: true });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) days.push({ d: new Date(month.getFullYear(), month.getMonth(), i), dim: false });
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1].d;
    const d = new Date(last); d.setDate(d.getDate() + 1);
    days.push({ d, dim: true });
  }
  const today = new Date(2026, 4, 21);

  const list = [];
  Object.entries(events).forEach(([date, evs]) => {
    evs.forEach(e => list.push({ date, ...e }));
  });
  list.sort((a, b) => a.date.localeCompare(b.date));
  const filtered = list.filter(e => (filter === "all" || e.k === filter) && (imp === "all" || e.imp === imp));

  const dotColor = imp => imp === "high" ? "var(--down)" : imp === "medium" ? "var(--warn)" : "var(--text-faint)";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Kalendarz</h1>
          <div className="page-sub">Wyniki spółek, makro, dywidendy · Twoje pozycje + watchlist</div>
        </div>
        <div className="row gap-8">
          <button className="btn">{Ico.dl} Eksport ICS</button>
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-head">
          <div className="row gap-12 center">
            <button className="iconbtn">‹</button>
            <div className="card-title" style={{ textTransform: "none", letterSpacing: 0, fontSize: 16 }}>{monthName}</div>
            <button className="iconbtn">›</button>
          </div>
          <div className="row gap-8 center">
            <span className="dim" style={{ fontSize: 11 }}>Legenda:</span>
            <span className="tag" style={{ color: "var(--down)", borderColor: "color-mix(in oklab, var(--down), transparent 70%)" }}>● Wyniki / Makro wysoki</span>
            <span className="tag" style={{ color: "var(--warn)" }}>● Dywidenda / Makro średni</span>
            <button className="btn">Dziś</button>
          </div>
        </div>
        <div style={{ padding: "16px 20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 8 }}>
            {["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"].map(d => (
              <div key={d} className="dim" style={{ fontSize: 11, letterSpacing: "0.06em", textAlign: "right", padding: "0 8px" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {days.map((day, i) => {
              const key = day.d.toISOString().slice(0, 10);
              const evs = events[key] || [];
              const isToday = day.d.toDateString() === today.toDateString();
              return (
                <div key={i} style={{
                  minHeight: 88,
                  background: isToday ? "var(--panel-2)" : "var(--panel)",
                  border: "1px solid " + (isToday ? "var(--accent)" : "var(--border)"),
                  borderRadius: 6,
                  padding: 8,
                  opacity: day.dim ? 0.35 : 1,
                  display: "flex", flexDirection: "column",
                }}>
                  <div className="num" style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>{day.d.getDate()}</div>
                  <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                    {evs.slice(0, 2).map((e, j) => (
                      <div key={j} className="row gap-8 center" style={{ fontSize: 10.5, color: "var(--text-dim)" }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor(e.imp), flexShrink: 0 }}></span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.t}</span>
                      </div>
                    ))}
                    {evs.length > 2 && <div className="dim" style={{ fontSize: 10 }}>+{evs.length - 2}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Zdarzenia — {monthName}</div>
          <div className="row gap-8">
            <div className="seg">
              {[["all", "Wszystkie"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]].map(([k, l]) => (
                <button key={k} className={imp === k ? "active" : ""} onClick={() => setImp(k)}>{l.toUpperCase()}</button>
              ))}
            </div>
            <div className="seg">
              {[["all", "Wszystkie"], ["earnings", "Wyniki"], ["div", "Dywidendy"], ["macro", "Makro"]].map(([k, l]) => (
                <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l.toUpperCase()}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="card-body">
          {filtered.map((e, i) => (
            <div key={i} className="stat-row" style={{ alignItems: "center" }}>
              <div className="row gap-12 center">
                <div style={{ width: 4, height: 36, background: dotColor(e.imp), borderRadius: 2 }}></div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{e.t}</div>
                  <div className="dim" style={{ fontSize: 11 }}>{e.date} · {e.c}</div>
                </div>
              </div>
              <div className="row gap-8">
                <span className="tag">{e.k.toUpperCase()}</span>
                <span className="tag" style={{ color: dotColor(e.imp), borderColor: "color-mix(in oklab, " + dotColor(e.imp) + ", transparent 70%)" }}>{e.imp.toUpperCase()}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="dim" style={{ padding: "20px 0", textAlign: "center", fontSize: 13 }}>Brak zdarzeń dla wybranych filtrów.</div>}
        </div>
      </div>
    </div>
  );
}

/* ============================================
   SCENARIO LAB — Akcje vs Opcje
   ============================================ */
function ScenarioLab() {
  const [strategy, setStrategy] = useState("Long Call");
  const [strike, setStrike] = useState(105);
  const [premium, setPremium] = useState(3.5);
  const [entry, setEntry] = useState(100);
  const [qty, setQty] = useState(1);
  const [iv, setIv] = useState(30);
  const [hideStock, setHideStock] = useState(false);

  // payoff at expiry — long call
  const xs = [];
  for (let s = 70; s <= 140; s += 1) xs.push(s);
  const optionPayoff = xs.map(s => (Math.max(0, s - strike) - premium) * 100 * qty);
  const stockPayoff = xs.map(s => (s - entry) * 100 * qty);

  const breakEven = strike + premium;
  const maxLoss = -premium * 100 * qty;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Scenario Lab — Akcje vs Opcje</h1>
          <div className="page-sub">Profil P/L na wygaśnięciu · porównaj kupno akcji z opcjami</div>
        </div>
        <div className="row gap-8">
          <button className="btn">Reset parametrów</button>
        </div>
      </div>

      <div className="detail-grid" style={{ gridTemplateColumns: "380px 1fr" }}>
        {/* Inputs */}
        <div className="col gap-16">
          <div className="card">
            <div className="card-head"><div className="card-title">Konfiguracja</div></div>
            <div className="card-body col gap-12">
              <div>
                <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Spółka z portfela</div>
                <select className="input" style={{ width: "100%" }}>
                  <option>— własne wartości —</option>
                  {MyFund.POSITIONS.map(p => <option key={p.sym}>{p.sym} · {p.name}</option>)}
                </select>
              </div>
              <div>
                <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Ticker opcji</div>
                <div className="row gap-8">
                  <input className="input grow" placeholder="np. AAPL" />
                  <button className="btn primary">Pobierz łańcuch</button>
                </div>
              </div>
              <div>
                <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Strategia</div>
                <select className="input" style={{ width: "100%" }} value={strategy} onChange={e => setStrategy(e.target.value)}>
                  <option>Long Call</option><option>Long Put</option><option>Covered Call</option><option>Cash-secured Put</option><option>Bull Call Spread</option>
                </select>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><div className="card-title">Parametry</div></div>
            <div className="card-body col gap-12">
              <FieldRow label="Cena wejścia ($)" value={entry} onChange={setEntry} />
              <FieldRow label="Ilość akcji / kontraktów" value={qty} onChange={setQty} />
              <FieldRow label="Strike Call ($)" value={strike} onChange={setStrike} />
              <FieldRow label="Premia ($ / opcja)" value={premium} onChange={setPremium} step={0.1} />
              <FieldRow label="IV — Implied Volatility (%)" value={iv} onChange={setIv} />
              <div>
                <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Data wygaśnięcia (DTE: 30)</div>
                <input className="input" style={{ width: "100%" }} defaultValue="2026-06-20" />
              </div>
              <label className="row gap-8 center" style={{ cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={hideStock} onChange={e => setHideStock(e.target.checked)} />
                <span>Ukryj linię bazową akcji</span>
              </label>
            </div>
          </div>
        </div>

        {/* Payoff chart + metrics */}
        <div className="col gap-16">
          <div className="card chart-card">
            <div className="chart-head">
              <div className="chart-figures">
                <div className="dim" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.1em" }}>Profil P/L na wygaśnięciu</div>
                <div className="chart-value">{strategy}</div>
                <div className="row gap-12 mt-8">
                  <div className="row gap-8 center">
                    <span style={{ width: 14, height: 2, background: "var(--accent)" }}></span>
                    <span className="dim" style={{ fontSize: 12 }}>Opcja</span>
                  </div>
                  {!hideStock && (
                    <div className="row gap-8 center">
                      <span style={{ width: 14, height: 2, background: "var(--info)" }}></span>
                      <span className="dim" style={{ fontSize: 12 }}>Akcja</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ padding: "0 12px 18px" }}>
              <PayoffChart xs={xs} option={optionPayoff} stock={hideStock ? null : stockPayoff} strike={strike} breakEven={breakEven} />
            </div>
          </div>

          <div className="kpi-grid">
            <Kpi label="Break-even" value={"$" + fmt(breakEven, 2)} sub="punkt zwrotu" />
            <Kpi label="Max zysk" value="∞" valueClass="up" sub="bez limitu" />
            <Kpi label="Max strata" value={"-$" + fmt(Math.abs(maxLoss), 2)} valueClass="down" sub="kapitał ryzyka" />
            <Kpi label="POP (Probability)" value="42.5%" sub={"σ z IV = " + iv + "%"} />
          </div>
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <Kpi label="BPE (depozyt)" value={"$" + fmt(premium * 100 * qty, 2)} sub="wymagana premia" />
            <Kpi label="±1σ zakres" value={"±$" + fmt(entry * (iv / 100) * Math.sqrt(30/365), 2)} sub="30 dni" />
            <Kpi label="Delta" value="0.42" sub="ekspozycja kierunkowa" />
            <Kpi label="Theta" value="-$0.18 / dzień" valueClass="down" sub="erozja czasowa" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, value, onChange, step = 1 }) {
  return (
    <div>
      <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      <input className="input" type="number" style={{ width: "100%" }} value={value} step={step} onChange={e => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}

function PayoffChart({ xs, option, stock, strike, breakEven }) {
  const ref = useRef(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => setW(ref.current.clientWidth));
    ro.observe(ref.current); setW(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);
  const all = [...option, ...(stock || [])];
  const min = Math.min(...all), max = Math.max(...all);
  const range = (max - min) || 1;
  const pad = 36, h = 320, innerH = h - pad * 2;
  function pts(arr) {
    return arr.map((v, i) => [
      (i / (arr.length - 1)) * (w - pad * 2) + pad,
      pad + innerH - ((v - min) / range) * innerH,
    ]);
  }
  const zeroY = pad + innerH - ((0 - min) / range) * innerH;
  const a = pts(option);
  const b = stock ? pts(stock) : null;
  const dA = a.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const dB = b ? b.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ") : "";

  const strikeX = ((xs.indexOf(Math.round(strike)) / (xs.length - 1)) * (w - pad * 2)) + pad;
  const beX = ((xs.indexOf(Math.round(breakEven)) / (xs.length - 1)) * (w - pad * 2)) + pad;

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={w} height={h} className="chart-svg">
        {/* zero line */}
        <line x1={pad} x2={w - pad} y1={zeroY} y2={zeroY} stroke="var(--border-strong)" strokeWidth="1" />
        {/* strike & be markers */}
        <line x1={strikeX} x2={strikeX} y1={pad} y2={h - pad} stroke="var(--text-faint)" strokeDasharray="3 4" />
        <text x={strikeX + 4} y={pad + 12} fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-faint)">strike {strike}</text>
        <line x1={beX} x2={beX} y1={pad} y2={h - pad} stroke="var(--accent)" strokeDasharray="3 4" opacity="0.7" />
        <text x={beX + 4} y={pad + 24} fontSize="10" fontFamily="var(--font-mono)" fill="var(--accent)">BE {breakEven.toFixed(2)}</text>
        {/* x-axis labels */}
        {[xs[0], xs[Math.floor(xs.length / 4)], xs[Math.floor(xs.length / 2)], xs[Math.floor(3 * xs.length / 4)], xs[xs.length - 1]].map((x, i) => {
          const px = (xs.indexOf(x) / (xs.length - 1)) * (w - pad * 2) + pad;
          return <text key={i} x={px} y={h - pad + 16} fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-faint)" textAnchor="middle">${x}</text>;
        })}
        {/* y-axis labels */}
        {[0,1,2,3,4].map(i => {
          const y = pad + (innerH / 4) * i;
          const v = max - (range / 4) * i;
          return (
            <g key={i}>
              <line x1={pad} x2={w - pad} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 4" opacity="0.4" />
              <text x={pad - 6} y={y + 4} fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-faint)" textAnchor="end">{(v >= 0 ? "+" : "") + (v / 100).toFixed(0)}</text>
            </g>
          );
        })}
        {b && <path d={dB} fill="none" stroke="var(--info)" strokeWidth="1.8" strokeDasharray="5 3" opacity="0.7" />}
        <path d={dA} fill="none" stroke="var(--accent)" strokeWidth="2.4" />
      </svg>
    </div>
  );
}

/* ============================================
   ATTRIBUTION (rozszerzona Analytics)
   ============================================ */
function Attribution() {
  const P = useMemo(() => MyFund.computePortfolio(), []);
  const totalValue = P.totalValue;
  const targets = {
    "DNP.WA": 30, "XTB.WA": 12, "MRB.WA": 7, "CDR.WA": 6, "MSW.WA": 2,
    "MDV.WA": 27, "S2B.WA": 5, "DIA.WA": 11,
  };
  const wins = P.positions.filter(p => p.plPct > 0);
  const losses = P.positions.filter(p => p.plPct <= 0);
  const avgReturn = P.positions.reduce((s, p) => s + p.plPct, 0) / P.positions.length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Analiza atrybucji</h1>
          <div className="page-sub">Na podstawie historii snapshotów portfela</div>
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-head"><div className="card-title">Analiza ryzyka</div></div>
        <div className="card-body" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
          <RiskKpi label="Zmienność (rok.)" value="51.2%" sub="Odch. std. zwrotów × √252" tone="down" />
          <RiskKpi label="Max Drawdown" value="-15.6%" sub="Największy spadek od szczytu" tone="warn" />
          <RiskKpi label="Sharpe Ratio" value="-3.67" sub="Zwrot / ryzyko (RF=4,5%)" tone="down" />
          <RiskKpi label="Sortino Ratio" value="-2.45" sub="Jak Sharpe, tylko dół" tone="down" />
          <RiskKpi label="Beta (S&P 500)" value="0.98" sub="Korelacja z rynkiem US" tone="neutral" />
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-head">
          <div className="card-title">Rebalansowanie portfela</div>
          <button className="btn">{Ico.star} Ustaw cele</button>
        </div>
        <div className="card-body col gap-12">
          {P.positions.slice(0, 8).map(p => {
            const w = (p.value / totalValue) * 100;
            const t = targets[p.sym] || 0;
            const diff = w - t;
            return (
              <div key={p.sym} className="row gap-16 center">
                <div style={{ width: 90, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  <span className="ticker-name" style={{ fontSize: 12, color: "var(--info)" }}>{p.sym}</span>
                </div>
                <div className="grow" style={{ position: "relative", height: 16, background: "var(--panel-2)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, width: w + "%", background: "linear-gradient(90deg, #7c9eff, #a78bfa)", borderRadius: 4 }}></div>
                  {t > 0 && <div style={{ position: "absolute", top: -2, bottom: -2, left: t + "%", width: 2, background: "var(--accent)" }}></div>}
                </div>
                <div style={{ width: 56, textAlign: "right" }} className="num">{w.toFixed(1)}%</div>
                <div style={{ width: 60, textAlign: "right" }} className={"num " + (Math.abs(diff) < 1 ? "dim" : diff > 0 ? "up" : "down")}>
                  {(diff >= 0 ? "+" : "") + diff.toFixed(1)}%
                </div>
              </div>
            );
          })}
          <div className="dim" style={{ fontSize: 12, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            Kliknij „Ustaw cele" aby zdefiniować docelową alokację i zobaczyć sugestie rebalansowania.
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiTinted label="Liczba pozycji" value={String(P.positions.length)} tone="info" />
        <KpiTinted label="Zyskowne" value={String(wins.length)} tone="up" />
        <KpiTinted label="Stratne" value={String(losses.length)} tone="down" />
        <KpiTinted label="Śr. zwrot" value={fmtPct(avgReturn, 1)} tone={avgReturn >= 0 ? "up" : "down"} />
      </div>
    </div>
  );
}

function RiskKpi({ label, value, sub, tone }) {
  const color = tone === "down" ? "var(--down)" : tone === "warn" ? "var(--warn)" : tone === "up" ? "var(--up)" : "var(--text)";
  return (
    <div>
      <div className="kpi-label">{label}</div>
      <div className="num" style={{ fontSize: 28, fontWeight: 600, color, letterSpacing: "-0.02em", margin: "6px 0 6px" }}>{value}</div>
      <div className="dim" style={{ fontSize: 11.5 }}>{sub}</div>
    </div>
  );
}

function KpiTinted({ label, value, tone }) {
  const bg = tone === "up" ? "rgba(0,217,126,0.08)"
           : tone === "down" ? "rgba(255,77,109,0.08)"
           : tone === "info" ? "rgba(124,158,255,0.06)"
           : "var(--panel)";
  const border = tone === "up" ? "color-mix(in oklab, var(--up), transparent 75%)"
             : tone === "down" ? "color-mix(in oklab, var(--down), transparent 75%)"
             : tone === "info" ? "color-mix(in oklab, var(--info), transparent 80%)"
             : "var(--border)";
  const fg = tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : tone === "info" ? "var(--info)" : "var(--text)";
  return (
    <div className="kpi" style={{ background: bg, borderColor: border }}>
      <div className="kpi-label">{label}</div>
      <div className="num" style={{ fontSize: 28, fontWeight: 600, color: fg, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

Object.assign(window, { History, Dividends, Calendar, ScenarioLab, Attribution, KpiTinted, RiskKpi });
