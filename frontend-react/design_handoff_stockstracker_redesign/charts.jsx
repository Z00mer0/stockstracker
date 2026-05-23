/* charts.jsx — sparklines, line/area chart, candles, donut */
const { useMemo, useState, useEffect, useRef } = React;

function fmt(n, d = 2) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Number(n).toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPLN(n, d = 2) { return fmt(n, d) + " zł"; }
function fmtPct(n, d = 2) {
  const sign = n > 0 ? "+" : "";
  return sign + fmt(n, d) + "%";
}
function fmtPctChip(n) {
  return (n > 0 ? "▲ " : n < 0 ? "▼ " : "· ") + fmt(Math.abs(n), 2) + "%";
}

function Sparkline({ data, width = 80, height = 28, color, strokeWidth = 1.6, fill = false }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = (max - min) || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const up = data[data.length - 1] >= data[0];
  const stroke = color || (up ? "var(--up)" : "var(--down)");
  return (
    <svg width={width} height={height} className="sparkline">
      {fill && (
        <path d={`${d} L${width},${height} L0,${height} Z`} fill={stroke} opacity="0.12" />
      )}
      <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function AreaChart({ data, height = 260, accent }) {
  const ref = useRef(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => setW(ref.current.clientWidth));
    ro.observe(ref.current);
    setW(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);
  const min = Math.min(...data), max = Math.max(...data);
  const range = (max - min) || 1;
  const pad = 24;
  const innerH = height - pad * 2;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
    const y = pad + innerH - ((v - min) / range) * innerH;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const up = data[data.length - 1] >= data[0];
  const stroke = accent || (up ? "var(--up)" : "var(--down)");
  const gradId = "grad-" + Math.abs(data[0] * 1000 | 0);

  function onMove(e) {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = Math.round(((x - pad) / (w - pad * 2)) * (data.length - 1));
    if (i >= 0 && i < data.length) setHover({ i, x: pts[i][0], y: pts[i][1], v: data[i] });
  }

  // y-axis grid (5 lines)
  const grid = [];
  for (let g = 0; g <= 4; g++) {
    const y = pad + (innerH / 4) * g;
    const val = max - (range / 4) * g;
    grid.push({ y, val });
  }

  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }} onMouseLeave={() => setHover(null)} onMouseMove={onMove}>
      <svg width={w} height={height} className="chart-svg">
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={pad} x2={w - pad} y1={g.y} y2={g.y} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
            <text x={w - pad + 6} y={g.y + 4} fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-faint)">{fmt(g.val, 0)}</text>
          </g>
        ))}
        <path d={`${d} L${w - pad},${height - pad} L${pad},${height - pad} Z`} fill={`url(#${gradId})`} />
        <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={pad} y2={height - pad} stroke="var(--border-strong)" strokeWidth="1" />
            <circle cx={hover.x} cy={hover.y} r="4" fill={stroke} stroke="var(--bg)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover && (
        <div style={{
          position: "absolute", left: hover.x + 8, top: hover.y - 30,
          background: "var(--panel-2)", border: "1px solid var(--border-strong)",
          borderRadius: 6, padding: "4px 8px", fontFamily: "var(--font-mono)", fontSize: 11,
          pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          {fmt(hover.v, 2)}
        </div>
      )}
    </div>
  );
}

function CandleChart({ data, height = 280 }) {
  // data: [{o,h,l,c}]
  const ref = useRef(null);
  const [w, setW] = useState(700);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => setW(ref.current.clientWidth));
    ro.observe(ref.current);
    setW(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);
  const min = Math.min(...data.map(d => d.l));
  const max = Math.max(...data.map(d => d.h));
  const range = (max - min) || 1;
  const pad = 28;
  const innerH = height - pad * 2;
  const cw = (w - pad * 2) / data.length;
  const bw = Math.max(2, cw * 0.62);

  function y(v) { return pad + innerH - ((v - min) / range) * innerH; }

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={w} height={height} className="chart-svg">
        {[0,1,2,3,4].map(i => {
          const yy = pad + (innerH / 4) * i;
          const v = max - (range / 4) * i;
          return (
            <g key={i}>
              <line x1={pad} x2={w - pad} y1={yy} y2={yy} stroke="var(--border)" strokeDasharray="2 4" opacity="0.5" />
              <text x={w - pad + 6} y={yy + 4} fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-faint)">{fmt(v, 0)}</text>
            </g>
          );
        })}
        {data.map((c, i) => {
          const cx = pad + cw * i + cw / 2;
          const up = c.c >= c.o;
          const col = up ? "var(--up)" : "var(--down)";
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1" />
              <rect x={cx - bw / 2} y={Math.min(y(c.o), y(c.c))} width={bw} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} fill={col} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Donut({ slices, size = 180, thickness = 26 }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  let a = -Math.PI / 2;
  const r = size / 2 - thickness / 2;
  const cx = size / 2, cy = size / 2;
  const paths = slices.map((s, i) => {
    const angle = (s.value / total) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * r, y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(a + angle) * r, y2 = cy + Math.sin(a + angle) * r;
    const large = angle > Math.PI ? 1 : 0;
    const d = `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}`;
    a += angle;
    return <path key={i} d={d} stroke={s.color} strokeWidth={thickness} fill="none" strokeLinecap="butt" />;
  });
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} stroke="var(--panel-2)" strokeWidth={thickness} fill="none" />
      {paths}
    </svg>
  );
}

function Heatmap({ items }) {
  // size cells by value, color by d1
  return (
    <div className="heatmap">
      {items.map((it, i) => {
        const intensity = Math.min(1, Math.abs(it.d1) / 5);
        const bg = it.d1 >= 0
          ? `oklch(${0.55 - intensity * 0.15} ${0.18 + intensity * 0.05} 150)`
          : `oklch(${0.55 - intensity * 0.15} ${0.18 + intensity * 0.05} 20)`;
        return (
          <div key={i} className="heat-cell" style={{ background: bg, gridColumn: it.span ? `span ${it.span}` : undefined }}>
            <div className="heat-sym">{it.sym}</div>
            <div className="heat-pct">{fmtPct(it.d1)}</div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { fmt, fmtPLN, fmtPct, fmtPctChip, Sparkline, AreaChart, CandleChart, Donut, Heatmap });
