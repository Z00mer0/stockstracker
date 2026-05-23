/* screens-b.jsx — Detail, Analytics, Transactions, Watchlist, Settings */

/* ============================================
   STOCK DETAIL
   ============================================ */
function StockDetail({ sym, setView, setDetail }) {
  const P = useMemo(() => MyFund.computePortfolio(), []);
  const pos = P.positions.find(p => p.sym === sym) || P.positions[0];
  const [tf, setTf] = useState("3M");
  const [mode, setMode] = useState("area"); // area | candles
  const series = useMemo(() => {
    const n = { "1D": 30, "1T": 30, "1M": 30, "3M": 90, "1R": 180, "YTD": 140, "MAX": 240 }[tf];
    return MyFund.genSeries(pos.sym.charCodeAt(0) * 13, n, pos.price * 0.85, pos.price * 0.04);
  }, [tf, pos.sym, pos.price]);
  const candles = useMemo(() => {
    const arr = [];
    let v = pos.price * 0.85;
    let rng = pos.sym.charCodeAt(0) * 23;
    const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
    for (let i = 0; i < 48; i++) {
      const o = v;
      const c = v + (rand() - 0.48) * v * 0.04;
      const h = Math.max(o, c) + rand() * v * 0.02;
      const l = Math.min(o, c) - rand() * v * 0.02;
      arr.push({ o, h, l, c }); v = c;
    }
    return arr;
  }, [pos.sym, pos.price]);

  return (
    <div className="page">
      <div className="crumbs">
        <a onClick={() => setView("portfolio")}>Portfolio</a>
        <span>›</span>
        <span>{pos.sym}</span>
      </div>
      <div className="page-head">
        <div className="row gap-16 center">
          <div className="ticker-logo" style={{ width: 56, height: 56, fontSize: 16, borderRadius: 12 }}>{pos.sym.slice(0, 2)}</div>
          <div>
            <div className="row gap-12 center">
              <h1 className="page-title" style={{ margin: 0 }}>{pos.name}</h1>
              <span className="tag">{pos.sym}</span>
              <span className="tag">{pos.cur}</span>
              <span className="tag" style={{ color: "var(--info)", borderColor: "color-mix(in oklab, var(--info), transparent 70%)" }}>{pos.sector}</span>
            </div>
            <div className="row gap-12 center mt-8">
              <span className="num" style={{ fontSize: 28, fontWeight: 600 }}>{fmt(pos.price, 2)} {pos.cur}</span>
              <span className={"chip " + (pos.d1 >= 0 ? "up" : "down")} style={{ fontSize: 13, padding: "4px 10px" }}>{fmtPctChip(pos.d1)}</span>
              <span className="dim" style={{ fontSize: 12 }}>· dzisiaj</span>
            </div>
          </div>
        </div>
        <div className="row gap-8">
          <button className="btn">{Ico.star} Obserwuj</button>
          <button className="btn danger">Sprzedaj</button>
          <button className="btn primary">{Ico.plus} Kup</button>
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <div className="card chart-card mb-16">
            <div className="chart-head" style={{ paddingBottom: 14 }}>
              <div className="chart-figures">
                <div className="dim" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.1em" }}>Kurs · {tf}</div>
                <div className="chart-value">{fmt(series[series.length - 1], 2)} <span style={{ fontSize: 16, color: "var(--text-dim)" }}>{pos.cur}</span></div>
              </div>
              <div className="col gap-8" style={{ alignItems: "flex-end" }}>
                <TimeframeSeg value={tf} onChange={setTf} />
                <div className="seg">
                  <button className={mode === "area" ? "active" : ""} onClick={() => setMode("area")}>LINIA</button>
                  <button className={mode === "candles" ? "active" : ""} onClick={() => setMode("candles")}>ŚWIECE</button>
                </div>
              </div>
            </div>
            <div style={{ padding: "0 12px 18px" }}>
              {mode === "area" ? <AreaChart data={series} height={320} /> : <CandleChart data={candles} height={320} />}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">Wiadomości</div>
              <span className="dim" style={{ fontSize: 11 }}>5 dziś · 2 z analizą</span>
            </div>
            <div className="card-body">
              {[
                { t: "Analitycy podnoszą cenę docelową dla " + pos.sym, s: "Bloomberg", time: "2g", tag: "ANALIZA" },
                { t: "Wyniki Q1 przebijają konsensus o 8%", s: "Reuters", time: "5g", tag: "WYNIKI" },
                { t: "Nowy kontrakt strategiczny - umowa wieloletnia", s: "PAP", time: "1d", tag: "BIZNES" },
                { t: "Insider buying: członek zarządu zwiększa pozycję", s: "MarketWatch", time: "2d", tag: "INSIDER" },
              ].map((n, i) => (
                <div className="news-item" key={i}>
                  <div className="news-thumb"></div>
                  <div>
                    <div className="news-title">{n.t}</div>
                    <div className="news-meta">
                      <span className="tag" style={{ fontSize: 9 }}>{n.tag}</span>
                      <span>{n.s}</span>
                      <span>·</span>
                      <span>{n.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col gap-16">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Twoja pozycja</div>
              <span className={"chip " + (pos.plPct >= 0 ? "up" : "down")}>{fmtPctChip(pos.plPct)}</span>
            </div>
            <div className="card-body">
              <div className="stat-row"><span className="lbl">Ilość</span><span className="val">{pos.qty} szt.</span></div>
              <div className="stat-row"><span className="lbl">Średni kurs</span><span className="val">{fmt(pos.avg, 2)} {pos.cur}</span></div>
              <div className="stat-row"><span className="lbl">Koszt zakupu</span><span className="val">{fmt(pos.qty * pos.avg, 2)} {pos.cur}</span></div>
              <div className="stat-row"><span className="lbl">Aktualna wartość</span><span className="val">{fmt(pos.qty * pos.price, 2)} {pos.cur}</span></div>
              <div className="stat-row"><span className="lbl">Zysk/strata</span><span className={"val " + (pos.pl >= 0 ? "up" : "down")}>{(pos.pl >= 0 ? "+" : "") + fmt(pos.pl, 2)} zł</span></div>
              <div className="stat-row"><span className="lbl">% portfela</span><span className="val">{((pos.value / P.totalValue) * 100).toFixed(2)}%</span></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Statystyki</div></div>
            <div className="card-body">
              <div className="stat-row"><span className="lbl">Otwarcie</span><span className="val">{fmt(pos.price * 0.992, 2)}</span></div>
              <div className="stat-row"><span className="lbl">Zakres dzienny</span><span className="val">{fmt(pos.price * 0.986, 2)} – {fmt(pos.price * 1.014, 2)}</span></div>
              <div className="stat-row"><span className="lbl">Zakres 52T</span><span className="val">{fmt(pos.price * 0.72, 2)} – {fmt(pos.price * 1.18, 2)}</span></div>
              <div className="stat-row"><span className="lbl">Wolumen</span><span className="val">4.21M</span></div>
              <div className="stat-row"><span className="lbl">Kapitalizacja</span><span className="val">3.42 bln</span></div>
              <div className="stat-row"><span className="lbl">P/E</span><span className="val">28.4</span></div>
              <div className="stat-row"><span className="lbl">Dywidenda</span><span className="val">0.96 / rok (1.2%)</span></div>
              <div className="stat-row"><span className="lbl">Beta</span><span className="val">1.21</span></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Ostatnie transakcje</div></div>
            <div className="card-body">
              {MyFund.TRANSACTIONS.filter(t => t.sym === pos.sym).slice(0, 4).map((t, i) => (
                <div className="stat-row" key={i}>
                  <span className="lbl">
                    <span className={"tag " + t.type.toLowerCase()}>{t.type}</span>
                    <span style={{ marginLeft: 8 }}>{t.date}</span>
                  </span>
                  <span className="val">{t.qty} × {fmt(t.price, 2)}</span>
                </div>
              ))}
              {MyFund.TRANSACTIONS.filter(t => t.sym === pos.sym).length === 0 && (
                <div className="dim" style={{ padding: "12px 0", fontSize: 12 }}>Brak transakcji w wybranym okresie.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================
   ANALYTICS
   ============================================ */
function Analytics() {
  const P = useMemo(() => MyFund.computePortfolio(), []);
  const series = useMemo(() => MyFund.genSeries(99, 180, P.totalValue * 0.82, P.totalValue * 0.03), [P.totalValue]);
  const benchmark = useMemo(() => MyFund.genSeries(202, 180, P.totalValue * 0.82, P.totalValue * 0.022), [P.totalValue]);

  // sector + currency + country pies
  const bySector = {};
  const byCurrency = { PLN: 0, USD: 0 };
  P.positions.forEach(p => {
    bySector[p.sector] = (bySector[p.sector] || 0) + p.value;
    byCurrency[p.cur] = (byCurrency[p.cur] || 0) + p.value;
  });
  const sectorSlices = Object.entries(bySector).map(([k, v]) => ({ label: k, value: v, color: SECTOR_COLORS[k] }));
  const currSlices = [
    { label: "PLN", value: byCurrency.PLN, color: "#00d97e" },
    { label: "USD", value: byCurrency.USD, color: "#7c9eff" },
  ];

  // monthly returns bars
  const months = ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"];
  const monthlyReturns = months.map((m, i) => {
    const rng = ((i + 1) * 9301 + 49297) % 233280 / 233280;
    return { m, v: (rng - 0.45) * 12 };
  });
  const maxMR = Math.max(...monthlyReturns.map(r => Math.abs(r.v)));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Analityka</h1>
          <div className="page-sub">Wyniki portfela, ekspozycja sektorowa, ryzyko · zakres: ostatnie 6 miesięcy</div>
        </div>
        <div className="row gap-8">
          <TimeframeSeg value="6M" onChange={() => {}} />
        </div>
      </div>

      {/* KPI risk */}
      <div className="kpi-grid">
        <Kpi label="Sharpe Ratio" value="1.42" chip="ZDROWO" chipUp={true} sub="vs. 1.10 dla WIG30" />
        <Kpi label="Volatility (annual.)" value="14.8%" chip="MED" chipUp={false} sub="σ = 4.2% miesięcznie" />
        <Kpi label="Max Drawdown" value="-8.4%" valueClass="down" sub="luty 2026 · 18 dni" />
        <Kpi label="Beta vs. WIG30" value="1.18" sub="korelacja 0.74" />
      </div>

      {/* Portfolio vs benchmark */}
      <div className="card chart-card mb-16">
        <div className="chart-head">
          <div className="chart-figures">
            <div className="dim" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.1em" }}>Portfel vs. WIG30 (znormalizowane)</div>
            <div className="row gap-16 mt-8 center">
              <div className="row gap-8 center">
                <span style={{ width: 12, height: 12, background: "var(--up)", borderRadius: 2 }}></span>
                <span className="num" style={{ fontSize: 18, fontWeight: 600 }}>+{(((series[series.length - 1] - series[0]) / series[0]) * 100).toFixed(2)}%</span>
                <span className="dim" style={{ fontSize: 12 }}>Portfel</span>
              </div>
              <div className="row gap-8 center">
                <span style={{ width: 12, height: 12, background: "var(--info)", borderRadius: 2 }}></span>
                <span className="num dim" style={{ fontSize: 16 }}>+{(((benchmark[benchmark.length - 1] - benchmark[0]) / benchmark[0]) * 100).toFixed(2)}%</span>
                <span className="dim" style={{ fontSize: 12 }}>WIG30</span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: "0 12px 18px", position: "relative" }}>
          <DualLine a={series} b={benchmark} />
        </div>
      </div>

      <div className="detail-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <div className="card-head"><div className="card-title">Alokacja sektorowa</div></div>
          <div className="card-body" style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <Donut slices={sectorSlices} size={170} thickness={24} />
            <div className="donut-legend grow">
              {sectorSlices.map((s, i) => (
                <div className="legend-row" key={i}>
                  <span className="legend-sw" style={{ background: s.color }}></span>
                  <span>{s.label}</span>
                  <span className="num dim">{((s.value / P.totalValue) * 100).toFixed(1)}%</span>
                  <span className="num">{fmt(s.value / 1000, 1)}k zł</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Ekspozycja walutowa</div></div>
          <div className="card-body" style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <Donut slices={currSlices} size={170} thickness={24} />
            <div className="donut-legend grow">
              {currSlices.map((s, i) => (
                <div className="legend-row" key={i}>
                  <span className="legend-sw" style={{ background: s.color }}></span>
                  <span>{s.label}</span>
                  <span className="num dim">{((s.value / P.totalValue) * 100).toFixed(1)}%</span>
                  <span className="num">{fmt(s.value / 1000, 1)}k zł</span>
                </div>
              ))}
              <div className="div-line" style={{ margin: "8px 0" }}></div>
              <div className="legend-row" style={{ gridTemplateColumns: "1fr auto" }}>
                <span className="dim">EUR/PLN</span><span className="num">4.2810</span>
              </div>
              <div className="legend-row" style={{ gridTemplateColumns: "1fr auto" }}>
                <span className="dim">USD/PLN</span><span className="num">3.9420</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 18 }}></div>

      <div className="card">
        <div className="card-head"><div className="card-title">Zwroty miesięczne (2026)</div></div>
        <div className="card-body" style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 200, padding: "16px 20px 24px" }}>
          {monthlyReturns.map((r, i) => {
            const h = (Math.abs(r.v) / maxMR) * 140;
            const up = r.v >= 0;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                <div className={"num " + (up ? "up" : "down")} style={{ fontSize: 11 }}>{fmtPct(r.v, 1)}</div>
                <div style={{
                  width: "100%",
                  height: Math.max(2, h),
                  background: up ? "var(--up)" : "var(--down)",
                  opacity: 0.85,
                  borderRadius: up ? "4px 4px 0 0" : "0 0 4px 4px",
                  transformOrigin: up ? "bottom" : "top",
                }}></div>
                <div className="dim" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{r.m}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DualLine({ a, b }) {
  const ref = useRef(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => setW(ref.current.clientWidth));
    ro.observe(ref.current);
    setW(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);
  // normalize to start at 100
  const normA = a.map(v => (v / a[0]) * 100);
  const normB = b.map(v => (v / b[0]) * 100);
  const all = [...normA, ...normB];
  const min = Math.min(...all), max = Math.max(...all);
  const range = (max - min) || 1;
  const height = 280, pad = 30;
  const innerH = height - pad * 2;
  function points(arr) {
    return arr.map((v, i) => {
      const x = (i / (arr.length - 1)) * (w - pad * 2) + pad;
      const y = pad + innerH - ((v - min) / range) * innerH;
      return [x, y];
    });
  }
  const ptsA = points(normA), ptsB = points(normB);
  const dA = ptsA.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const dB = ptsB.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={w} height={height}>
        {[0,1,2,3,4].map(i => {
          const y = pad + (innerH / 4) * i;
          const v = max - (range / 4) * i;
          return (
            <g key={i}>
              <line x1={pad} x2={w - pad} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 4" opacity="0.5" />
              <text x={w - pad + 6} y={y + 4} fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-faint)">{v.toFixed(0)}</text>
            </g>
          );
        })}
        <path d={dB} fill="none" stroke="var(--info)" strokeWidth="1.6" opacity="0.75" strokeDasharray="4 3" />
        <path d={dA} fill="none" stroke="var(--up)" strokeWidth="2.2" />
      </svg>
    </div>
  );
}

/* ============================================
   TRANSACTIONS
   ============================================ */
function Transactions() {
  const [filter, setFilter] = useState("all");
  const txs = MyFund.TRANSACTIONS;
  const filtered = txs.filter(t => filter === "all" ? true : t.type.toLowerCase() === filter);
  const totals = {
    buy: txs.filter(t => t.type === "BUY").reduce((s, t) => s + t.total * (t.cur === "USD" ? 3.94 : 1), 0),
    sell: txs.filter(t => t.type === "SELL").reduce((s, t) => s + t.total * (t.cur === "USD" ? 3.94 : 1), 0),
    div: txs.filter(t => t.type === "DIV").reduce((s, t) => s + t.total * (t.cur === "USD" ? 3.94 : 1), 0),
    fee: txs.filter(t => t.type === "FEE").reduce((s, t) => s + t.total, 0),
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Transakcje</h1>
          <div className="page-sub">Historia kupna, sprzedaży, dywidend i prowizji</div>
        </div>
        <div className="row gap-8">
          <button className="btn">{Ico.dl} Eksport CSV</button>
          <button className="btn primary">{Ico.plus} Dodaj transakcję</button>
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label="Kupna (30 dni)" value={fmtPLN(totals.buy, 0)} sub={txs.filter(t => t.type === "BUY").length + " transakcji"} chip="ZAKUP" chipUp={true} />
        <Kpi label="Sprzedaże (30 dni)" value={fmtPLN(totals.sell, 0)} sub={txs.filter(t => t.type === "SELL").length + " transakcji"} chip="SPRZEDAŻ" chipUp={false} />
        <Kpi label="Dywidendy (30 dni)" value={fmtPLN(totals.div, 0)} sub={txs.filter(t => t.type === "DIV").length + " wypłat"} valueClass="up" />
        <Kpi label="Prowizje (30 dni)" value={fmtPLN(totals.fee, 0)} sub="0.21% obrotu" />
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Historia · {filtered.length} pozycji</div>
          <div className="seg">
            {[
              ["all", "Wszystkie"], ["buy", "Kupno"], ["sell", "Sprzedaż"], ["div", "Dywidendy"], ["fee", "Prowizje"]
            ].map(([k, l]) => (
              <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Typ</th>
              <th>Aktywo</th>
              <th className="right">Ilość</th>
              <th className="right">Cena</th>
              <th className="right">Wartość</th>
              <th className="right">Waluta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr key={i}>
                <td className="num dim">{t.date}</td>
                <td><span className={"tag " + t.type.toLowerCase()}>{t.type}</span></td>
                <td>
                  {t.sym === "—" ? <span className="dim">{t.sym}</span> : (
                    <div className="ticker-cell">
                      <div className="ticker-logo" style={{ width: 26, height: 26, fontSize: 10 }}>{t.sym.slice(0, 2)}</div>
                      <div className="ticker-name" style={{ fontSize: 13 }}>{t.sym}</div>
                    </div>
                  )}
                </td>
                <td className="right num">{t.qty}</td>
                <td className="right num">{fmt(t.price, 2)}</td>
                <td className="right num" style={{ fontWeight: 600 }}>{fmt(t.total, 2)}</td>
                <td className="right num dim">{t.cur}</td>
                <td className="right"><button className="btn ghost" style={{ height: 26, padding: "0 8px", fontSize: 11 }}>···</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================
   WATCHLIST + SETTINGS (light placeholders)
   ============================================ */
function Watchlist({ setView, setDetail }) {
  const watch = [
    { sym: "PZU",   name: "PZU S.A.",       price: 48.20, d1: +0.84, cur: "PLN" },
    { sym: "PEP",   name: "PepsiCo Inc.",   price: 168.40, d1: -0.42, cur: "USD" },
    { sym: "AMD",   name: "AMD Inc.",       price: 142.30, d1: +2.10, cur: "USD" },
    { sym: "META",  name: "Meta Platforms", price: 521.40, d1: +1.84, cur: "USD" },
    { sym: "11B",   name: "11 bit studios", price: 412.00, d1: -1.20, cur: "PLN" },
    { sym: "PKO",   name: "PKO BP",         price: 68.40,  d1: +0.32, cur: "PLN" },
  ];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Obserwowane</h1>
          <div className="page-sub">Aktywa, które masz na oku — bez pozycji w portfelu</div>
        </div>
        <button className="btn primary">{Ico.plus} Dodaj do listy</button>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Aktywo</th><th className="right">Kurs</th><th className="right">Dzień</th><th>Trend 30D</th><th className="right">Akcje</th></tr>
          </thead>
          <tbody>
            {watch.map(w => (
              <tr key={w.sym} onClick={() => { setDetail(w.sym); setView("detail"); }}>
                <td>
                  <div className="ticker-cell">
                    <div className="ticker-logo">{w.sym.slice(0, 2)}</div>
                    <div>
                      <div className="ticker-name">{w.sym}</div>
                      <div className="ticker-sub">{w.name} · {w.cur}</div>
                    </div>
                  </div>
                </td>
                <td className="right num">{fmt(w.price, 2)}</td>
                <td className="right"><span className={"num " + (w.d1 >= 0 ? "up" : "down")}>{fmtPct(w.d1)}</span></td>
                <td><Sparkline data={MyFund.genSeries(w.sym.charCodeAt(0) * 7, 30, 100, 4)} width={120} height={32} /></td>
                <td className="right"><button className="btn ghost" style={{ height: 28, padding: "0 10px", fontSize: 11 }}>Kup</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Settings() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Ustawienia</h1>
          <div className="page-sub">Profil, brokerzy, powiadomienia, podatki</div>
        </div>
      </div>
      <div className="detail-grid">
        <div className="card">
          <div className="card-head"><div className="card-title">Połączone konta brokerskie</div></div>
          <div className="card-body">
            {[
              { n: "XTB", s: "Połączono · synch. 17:42", on: true },
              { n: "mBank Brokerage", s: "Połączono · synch. 16:18", on: true },
              { n: "Interactive Brokers", s: "Odłączony", on: false },
            ].map((b, i) => (
              <div className="stat-row" key={i}>
                <span><span className="dot-status" style={{ background: b.on ? "var(--up)" : "var(--text-faint)" }}></span>{b.n}<span className="dim" style={{ marginLeft: 12, fontSize: 12 }}>{b.s}</span></span>
                <button className="btn ghost">{b.on ? "Rozłącz" : "Połącz"}</button>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Profil podatkowy</div></div>
          <div className="card-body">
            <div className="stat-row"><span className="lbl">Rezydencja</span><span className="val">Polska</span></div>
            <div className="stat-row"><span className="lbl">Stopa podatku</span><span className="val">19% (Belka)</span></div>
            <div className="stat-row"><span className="lbl">Strata przeniesiona</span><span className="val">-1 240 zł</span></div>
            <div className="stat-row"><span className="lbl">Należny podatek YTD</span><span className="val up">412 zł</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { StockDetail, Analytics, Transactions, Watchlist, Settings });
