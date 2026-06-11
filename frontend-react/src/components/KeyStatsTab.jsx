import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

function fmt(val, opts = {}) {
  if (val == null || (typeof val === 'number' && !isFinite(val))) return '—';
  const { decimals = 2, suffix = '', percent = false, locale = 'pl-PL' } = opts;
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return '—';
  const v = percent ? num * 100 : num;
  return v.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
}

function fmtLarge(val, locale = 'pl-PL') {
  if (val == null) return '—';
  const abs = Math.abs(val);
  if (abs >= 1e12) return (val / 1e12).toFixed(2) + ' T';
  if (abs >= 1e9)  return (val / 1e9).toFixed(2)  + ' B';
  if (abs >= 1e6)  return (val / 1e6).toFixed(2)  + ' M';
  return val.toLocaleString(locale, { maximumFractionDigits: 0 });
}

function fmtDate(ts, locale = 'pl-PL') {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const REC_LABEL = {
  'strong_buy':   ['Silny kupno',    '#10b981'],
  'buy':          ['Kupno',          '#34d399'],
  'hold':         ['Trzymaj',        '#f59e0b'],
  'underperform': ['Sprzedaj',       '#f43f5e'],
  'sell':         ['Silna sprzedaż', '#ef4444'],
};

// Hardcoded per-symbol overrides for metrics unavailable via keystats API
const HARDCODED_METRICS = {
  'DNP.WA': {
    roic:          20.2,
    netDebtEbitda:  0.8,
    roe:           30.0,
    assetTurnover:  2.8,
    leverageRatio:  2.2,
  },
};

const GROWTH_DRIVERS = {
  'DNP.WA': {
    openings:     '~300 sklepów / rok',
    reinvestment: '~100% OCF',
  },
};

const COMPOUNDER_TOOLTIP = 'Niski wskaźnik wynika z 100% reinwestycji gotówki operacyjnej w budowę nowych marketów i centrów logistycznych (model compoundera). Spółka nie akumuluje gotówki — natychmiast alokuje ją z wysoką stopą zwrotu (ROIC ~20%).';

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', cursor: 'help', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
          background: '#1e293b', color: '#94a3b8',
          fontSize: 10, lineHeight: 1.5, padding: '6px 10px', borderRadius: 6,
          width: 220, zIndex: 200, border: '1px solid #334155',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)', pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────
function Row({ label, value, color, tooltip }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      {tooltip
        ? <Tooltip text={tooltip}><span style={{ fontSize: 12, color: 'var(--text-dim)', borderBottom: '1px dashed rgba(100,116,139,0.35)', paddingBottom: 1 }}>{label}</span></Tooltip>
        : <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
      }
      <span style={{ fontSize: 12, fontWeight: 600, color: color || 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── Health bar ───────────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s >= 7) return '#10b981';
  if (s >= 5) return '#f59e0b';
  return '#f43f5e';
}

function HealthBar({ label, score, tooltip }) {
  const color = scoreColor(score);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {label}
          {tooltip && (
            <Tooltip text={tooltip}>
              <span style={{ fontSize: 10, color: 'var(--text-faint)', lineHeight: 1 }}>ⓘ</span>
            </Tooltip>
          )}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>{score.toFixed(1)} / 10</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--panel-2)' }}>
        <div style={{ height: '100%', width: `${score * 10}%`, background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

// ─── Score functions ──────────────────────────────────────────────────────────
function growthScore(g) {
  if (g == null) return null;
  if (g > 0.20) return 10; if (g > 0.15) return 9; if (g > 0.10) return 8;
  if (g > 0.07) return 7;  if (g > 0.05) return 6; if (g > 0.02) return 5;
  if (g > 0)    return 4;  if (g > -0.05) return 3; if (g > -0.10) return 2;
  return 1;
}
function profitScore(m) {
  if (m == null) return null;
  if (m > 0.25) return 10; if (m > 0.20) return 9; if (m > 0.15) return 8;
  if (m > 0.10) return 7;  if (m > 0.07) return 6; if (m > 0.05) return 5;
  if (m > 0.03) return 4;  if (m > 0)    return 3; if (m > -0.05) return 2;
  return 1;
}
function cashFlowScore(m) {
  if (m == null) return null;
  if (m > 0.20) return 10; if (m > 0.15) return 9; if (m > 0.10) return 8;
  if (m > 0.07) return 7;  if (m > 0.05) return 6; if (m > 0.03) return 5;
  if (m > 0.01) return 4;  if (m > 0)    return 3;
  return 2;
}

// ─── Growth Drivers ───────────────────────────────────────────────────────────
function GrowthDrivers({ symbol, roic }) {
  const drivers = GROWTH_DRIVERS[symbol];
  if (!drivers) return null;
  const items = [
    { label: 'Otwarcia sklepów',   value: drivers.openings },
    { label: 'Stopa reinwestycji', value: drivers.reinvestment },
    { label: 'ROIC',               value: roic != null ? `${roic.toFixed(1)}%` : '—', highlight: true },
  ];
  return (
    <Section title="Dynamika Rozwoju">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {items.map(({ label, value, highlight }) => (
          <div key={label} style={{ background: 'var(--panel-2)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, color: 'var(--text-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: highlight ? '#008751' : 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── DuPont Analysis ─────────────────────────────────────────────────────────
function DuPontAnalysis({ netMargin, assetTurnover, leverage, roe }) {
  if (netMargin == null && roe == null) return null;
  const fmtM = v => v != null ? `${(v * 100).toFixed(1)}%` : '—';
  const fmtX = v => v != null ? `${v.toFixed(1)}x` : '—';
  const boxes = [
    {
      label: 'Marża netto',
      value: fmtM(netMargin),
      color: '#10b981',
      tooltip: 'Zysk netto / Przychody. Efektywność operacyjna po wszystkich kosztach.',
    },
    {
      label: 'Obrót aktywami',
      value: fmtX(assetTurnover),
      color: 'var(--accent)',
      tooltip: 'Przychody / Aktywa ogółem. Jak efektywnie spółka obraca majątkiem by generować sprzedaż.',
    },
    {
      label: 'Dźwignia fin.',
      value: fmtX(leverage),
      color: '#f59e0b',
      tooltip: 'Aktywa ogółem / Kapitał własny. Poziom finansowania długiem. Niska dźwignia = bezpieczny bilans.',
    },
  ];
  return (
    <Section title="Analiza DuPont (ROE)">
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        {boxes.map((box, i) => (
          <React.Fragment key={i}>
            <div style={{ flex: 1, background: 'var(--panel-2)', borderRadius: 8, padding: '7px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: 'var(--text-faint)', marginBottom: 3, lineHeight: 1.2 }}>{box.label}</div>
              <Tooltip text={box.tooltip}>
                <span style={{ fontSize: 13, fontWeight: 700, color: box.color, fontFamily: 'JetBrains Mono, monospace', borderBottom: '1px dashed rgba(100,116,139,0.3)', paddingBottom: 1, cursor: 'help' }}>
                  {box.value}
                </span>
              </Tooltip>
            </div>
            <span style={{ fontSize: 14, color: 'var(--text-faint)', flexShrink: 0, userSelect: 'none' }}>×</span>
          </React.Fragment>
        ))}
        <span style={{ fontSize: 14, color: 'var(--text-faint)', flexShrink: 0, userSelect: 'none' }}>=</span>
        <div style={{
          flex: 1, background: 'rgba(0,135,81,0.08)', border: '1px solid rgba(0,135,81,0.22)',
          borderRadius: 8, padding: '7px 6px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 8, color: 'var(--text-faint)', marginBottom: 3 }}>ROE</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#008751', fontFamily: 'JetBrains Mono, monospace' }}>
            {roe != null ? `${roe.toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>Model DuPont (3-czynnikowy) · ROE = Marża × Obrót × Dźwignia</div>
    </Section>
  );
}

// ─── Valuation Gauge ─────────────────────────────────────────────────────────
function ValuationGauge({ currentPrice, dcfValue, analystTarget }) {
  const { locale } = useLanguage();
  if (!currentPrice) return null;
  const vals = [currentPrice, dcfValue, analystTarget].filter(v => v != null);
  if (vals.length < 2) return null;

  const minVal = Math.min(...vals) * 0.88;
  const maxVal = Math.max(...vals) * 1.12;
  const range  = maxVal - minVal || 1;
  const toX    = v => ((v - minVal) / range) * 100;

  const priceX  = toX(currentPrice);
  const dcfX    = dcfValue      != null ? toX(dcfValue)      : null;
  const targetX = analystTarget != null ? toX(analystTarget) : null;

  const dcfPremium = dcfValue != null ? ((currentPrice - dcfValue) / dcfValue * 100) : null;
  const isUndervalued = dcfPremium != null && dcfPremium < 0;

  return (
    <div>
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--panel-2)', margin: '26px 0 30px' }}>
        {dcfX != null && (
          <div style={{
            position: 'absolute', top: 0, height: '100%',
            left: `${Math.min(dcfX, priceX)}%`,
            width: `${Math.abs(priceX - dcfX)}%`,
            background: isUndervalued ? 'rgba(0,135,81,0.25)' : 'rgba(244,63,94,0.18)',
            borderRadius: 2,
          }} />
        )}
        {dcfX != null && (
          <div style={{ position: 'absolute', top: '50%', left: `${dcfX}%`, transform: 'translate(-50%, -50%)', zIndex: 3 }}>
            <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '9px solid #008751' }} />
            <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: '#008751', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
              DCF {dcfValue.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        )}
        <div style={{ position: 'absolute', top: '50%', left: `${priceX}%`, transform: 'translate(-50%, -50%)', zIndex: 4 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--text)', border: '2px solid var(--panel)' }} />
          <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: 'var(--text)', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
            {currentPrice.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        {targetX != null && (
          <div style={{ position: 'absolute', top: '50%', left: `${targetX}%`, transform: 'translate(-50%, -50%)', zIndex: 3 }}>
            <div style={{ width: 2, height: 14, background: '#f59e0b', marginLeft: -1 }} />
            <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: '#f59e0b', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
              TP {analystTarget.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: -6 }}>
        <span style={{ color: 'var(--text-faint)' }}>Zysk DCF: 5Y, dysk. 10%, wzrost hist., term. 3%</span>
        {dcfPremium != null && (
          <span style={{ color: isUndervalued ? '#008751' : '#f43f5e', fontWeight: 600 }}>
            {dcfPremium < 0
              ? `Dyskonto: ${dcfPremium.toFixed(1)}%`
              : `Premia rynkowa: +${dcfPremium.toFixed(1)}%`}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Peer Comparison ─────────────────────────────────────────────────────────
const PEERS_DATA = [
  { name: 'Jeronimo Martins', ticker: 'JMT.LS', pe: 17.2, netMargin: 2.1 },
  { name: 'Eurocash',         ticker: 'EUR.WA', pe: 11.8, netMargin: 0.7 },
];

function PeerComparison({ dinoPE, dinoNetMargin }) {
  const [tip, setTip] = useState(false);
  if (dinoPE == null && dinoNetMargin == null) return null;
  const dinoMarginPct = dinoNetMargin != null ? dinoNetMargin * 100 : 0;
  const maxMarginPct  = Math.max(dinoMarginPct, ...PEERS_DATA.map(p => p.netMargin));
  return (
    <Section title={
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        Porównanie sektorowe
        <span
          style={{ fontSize: 11, color: 'var(--text-faint)', cursor: 'help', position: 'relative' }}
          onMouseEnter={() => setTip(true)}
          onMouseLeave={() => setTip(false)}
        >
          ⓘ
          {tip && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
              background: '#1e293b', color: '#94a3b8', fontSize: 10, lineHeight: 1.5,
              padding: '6px 10px', borderRadius: 6, width: 240, zIndex: 200,
              border: '1px solid #334155', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', pointerEvents: 'none',
            }}>
              <strong style={{ color: '#e2e8f0' }}>Premia za wzrost</strong><br/>
              Dino handluje z premią do konkurencji ze względu na wyższe tempo wzrostu (~12–15% przychodów rocznie) i wyższe marże. Inwestorzy płacą więcej za spółkę z wyraźną trajektorią wzrostu.
            </div>
          )}
        </span>
      </span>
    }>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left',  color: 'var(--text-faint)', fontWeight: 500, padding: '3px 0 5px', borderBottom: '1px solid var(--border)' }}>Spółka</th>
            <th style={{ textAlign: 'right', color: 'var(--text-faint)', fontWeight: 500, padding: '3px 8px 5px', borderBottom: '1px solid var(--border)' }}>C/Z</th>
            <th style={{ textAlign: 'right', color: 'var(--text-faint)', fontWeight: 500, padding: '3px 0 5px', borderBottom: '1px solid var(--border)' }}>Marża netto</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ background: 'rgba(0,135,81,0.06)' }}>
            <td style={{ padding: '5px 0', color: 'var(--text)', fontWeight: 600 }}>
              Dino <span style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 400 }}>DNP.WA</span>
            </td>
            <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
              {dinoPE != null ? `${dinoPE.toFixed(1)}x` : '—'}
            </td>
            <td style={{ textAlign: 'right', padding: '5px 0', color: '#008751', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--panel-2)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${maxMarginPct > 0 ? (dinoMarginPct / maxMarginPct) * 100 : 0}%`, background: '#008751', borderRadius: 2 }} />
                </div>
                {dinoNetMargin != null ? `${dinoMarginPct.toFixed(1)}%` : '—'}
              </div>
            </td>
          </tr>
          {PEERS_DATA.map(p => (
            <tr key={p.ticker}>
              <td style={{ padding: '5px 0', color: 'var(--text-dim)' }}>
                {p.name} <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{p.ticker}</span>
              </td>
              <td style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>{p.pe.toFixed(1)}x</td>
              <td style={{ textAlign: 'right', padding: '5px 0', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--panel-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${maxMarginPct > 0 ? (p.netMargin / maxMarginPct) * 100 : 0}%`, background: '#64748b', borderRadius: 2 }} />
                  </div>
                  {p.netMargin.toFixed(1)}%
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 5 }}>Dane konkurencji: maj 2026 · szacunkowe</div>
    </Section>
  );
}

// ─── Investment Checklist ─────────────────────────────────────────────────────
function CheckItem({ label, pass, value, tooltip }) {
  const color = pass === true ? '#008751' : pass === false ? '#f43f5e' : 'var(--text-faint)';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', opacity: pass === null ? 0.38 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color, lineHeight: 1 }}>{pass === true ? '✓' : pass === false ? '✗' : '–'}</span>
        {tooltip
          ? <Tooltip text={tooltip}><span style={{ fontSize: 12, color: 'var(--text-dim)', borderBottom: '1px dashed rgba(100,116,139,0.35)', paddingBottom: 1 }}>{label}</span></Tooltip>
          : <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
        }
      </div>
      <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color, fontWeight: 600 }}>{value ?? '—'}</span>
    </div>
  );
}

function InvestmentChecklist({ psRatio, roic, netDebtEbitda }) {
  const checks = [
    {
      label: 'C/P < 1,0',
      pass: psRatio != null ? psRatio < 1.0 : null,
      value: psRatio != null ? `${psRatio.toFixed(2)}x` : null,
      tooltip: 'Cena/Przychody (Price/Sales). C/P < 1 oznacza że płacisz mniej niż 1 PLN za każdy 1 PLN przychodów. Dla spółek wzrostowych wyższe wartości są normą — sprawdź tempo wzrostu.',
    },
    {
      label: 'ROIC > 20%',
      pass: roic != null ? roic > 20 : null,
      value: roic != null ? `${roic.toFixed(1)}%` : null,
      tooltip: 'Return on Invested Capital — zwrot z zainwestowanego kapitału. Obliczany jako Zysk netto / (Kapitał własny + Dług netto). ROIC > 15% to oznaka przewagi konkurencyjnej.',
    },
    {
      label: 'Dług netto / EBITDA < 2,0',
      pass: netDebtEbitda != null ? netDebtEbitda < 2.0 : null,
      value: netDebtEbitda != null ? `${netDebtEbitda.toFixed(2)}x` : null,
      tooltip: 'Ile lat potrzeba na spłatę długu z zysku operacyjnego (EBITDA). Poniżej 2x — komfortowe. Powyżej 4x — sygnał ostrzegawczy. Wartość ujemna = gotówka netto.',
    },
  ];

  const passCount = checks.filter(c => c.pass === true).length;
  const total     = checks.filter(c => c.pass !== null).length;

  return (
    <Section title={`Sygnały inwestycyjne ${total > 0 ? `(${passCount}/${total})` : ''}`}>
      {checks.map((c, i) => <CheckItem key={i} {...c} />)}
    </Section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function KeyStatsTab({ symbol, livePrice, yearChangePct }) {
  const { locale } = useLanguage();
  const fmtL      = (val, opts = {}) => fmt(val, { ...opts, locale });
  const fmtLargeL = (val) => fmtLarge(val, locale);
  const fmtDateL  = (ts) => fmtDate(ts, locale);
  const [raw, setRaw]         = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setRaw(null);
    fetch(`/api/financials/keystats?symbol=${encodeURIComponent(symbol)}`, {
      headers: { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' },
    })
      .then(r => r.json())
      .then(json => setRaw(json.error ? null : json))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) return (
    <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>Ładowanie wskaźników…</div>
  );

  const hm = HARDCODED_METRICS[symbol] ?? {};

  const shares        = raw?.sharesOutstanding ?? null;
  const liveMarketCap = livePrice && shares ? livePrice * shares : null;
  const netDebt       = (raw?.totalDebt != null && raw?.cashAndEquivalents != null)
    ? raw.totalDebt - raw.cashAndEquivalents : null;
  const liveEV        = liveMarketCap != null && netDebt != null ? liveMarketCap + netDebt : null;

  const peRatio  = liveMarketCap && raw?.ttmNetIncome  ? liveMarketCap / raw.ttmNetIncome  : null;
  const psRatio  = liveMarketCap && raw?.ttmRevenue    ? liveMarketCap / raw.ttmRevenue    : null;
  const evEbitda = liveEV        && raw?.ttmEbitda     ? liveEV        / raw.ttmEbitda     : null;
  const pfcf     = liveMarketCap && raw?.ttmFcf        ? liveMarketCap / raw.ttmFcf        : null;
  const epsTtm   = raw?.ttmNetIncome && shares         ? raw.ttmNetIncome / shares         : null;
  const fcfYield = liveMarketCap && raw?.ttmFcf        ? (raw.ttmFcf / liveMarketCap) * 100 : null;

  const netMargin = raw?.ttmNetIncome && raw?.ttmRevenue ? raw.ttmNetIncome / raw.ttmRevenue : null;
  const fcfMargin = raw?.ttmFcf       && raw?.ttmRevenue ? raw.ttmFcf       / raw.ttmRevenue : null;

  // ROIC — computed first, fall back to hardcoded
  const roicComputed = raw?.ttmNetIncome && raw?.equity != null && netDebt != null && (raw.equity + netDebt) > 0
    ? (raw.ttmNetIncome / (raw.equity + netDebt)) * 100 : null;
  const roic = roicComputed ?? hm.roic ?? null;

  // Net Debt / EBITDA — computed first, fall back to hardcoded
  const netDebtEbitdaComputed = netDebt != null && raw?.ttmEbitda && raw.ttmEbitda > 0
    ? netDebt / raw.ttmEbitda : null;
  const netDebtEbitda = netDebtEbitdaComputed ?? hm.netDebtEbitda ?? null;

  // DuPont components
  const roeComputed   = raw?.ttmNetIncome && raw?.equity && raw.equity > 0
    ? (raw.ttmNetIncome / raw.equity) * 100 : null;
  const roe           = roeComputed ?? hm.roe ?? null;
  const assetTurnover = hm.assetTurnover ?? null;
  const leverageRatio = hm.leverageRatio ?? null;

  const isCompounder = !!GROWTH_DRIVERS[symbol];

  const gScore    = growthScore(raw?.revenueGrowthYoY);
  const pScore    = profitScore(netMargin);
  const cfScore   = cashFlowScore(fcfMargin);
  const hasHealth = gScore != null || pScore != null || cfScore != null;

  const low52  = raw?.fiftyTwoWeekLow;
  const high52 = raw?.fiftyTwoWeekHigh;
  const pct52  = livePrice != null && low52 != null && high52 != null && high52 > low52
    ? ((livePrice - low52) / (high52 - low52)) * 100 : null;

  const rec              = raw?.recommendationKey ? REC_LABEL[raw.recommendationKey.toLowerCase()] : null;
  const analystUpside    = livePrice && raw?.targetMeanPrice
    ? ((raw.targetMeanPrice - livePrice) / livePrice) * 100 : null;
  const dcfUpside = livePrice && raw?.dcfFairValue
    ? ((livePrice - raw.dcfFairValue) / raw.dcfFairValue) * 100 : null;

  const hasFundamentalValuation = analystUpside != null || dcfUpside != null;
  const hasValuation    = peRatio || psRatio || evEbitda || pfcf || raw?.forwardPE;
  const hasProfit       = epsTtm || raw?.forwardEps;
  const hasDividend     = raw?.dividendYield != null || raw?.dividendRate != null;
  const has52W          = low52 != null || high52 != null;
  const hasAnalysts     = raw?.targetMeanPrice != null || rec || raw?.nextEarningsDate;
  const hasFundamentals = raw?.ttmRevenue || raw?.bookPerShare || fcfYield != null;
  const hasChecklist    = psRatio != null || roic != null || netDebtEbitda != null;
  const hasDuPont       = netMargin != null || roe != null;

  if (!hasValuation && !has52W && !hasAnalysts && !hasDividend && !hasProfit && !hasFundamentals) {
    return (
      <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
        Brak danych — załaduj dane finansowe w zakładce Finanse
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 20px 20px' }}>

      {hasValuation && (
        <Section title="Wycena">
          {peRatio        != null && <Row label="C/Z (TTM)"     value={fmtL(peRatio,  { decimals: 1, suffix: 'x' })} tooltip="Cena/Zysk (P/E). Ile płacisz za 1 PLN zysku netto. Mediana historyczna ~15x. Wysokie P/E = oczekiwania wzrostu lub przeszacowanie." />}
          {raw?.forwardPE != null && <Row label="C/Z (forward)" value={fmtL(raw.forwardPE, { decimals: 1, suffix: 'x' })} tooltip="Cena do prognozowanego zysku na następne 12 miesięcy. Niższy od TTM = oczekiwany wzrost zysku." />}
          {psRatio        != null && <Row label="C/P"           value={fmtL(psRatio,  { decimals: 1, suffix: 'x' })} tooltip="Cena/Przychody (Price/Sales). Ile płacisz za 1 PLN przychodów. C/P < 1 = tanie, ale sprawdź marże. Dla retailerów typowe 0,3–1,5x." />}
          {evEbitda       != null && <Row label="EV/EBITDA"     value={fmtL(evEbitda, { decimals: 1, suffix: 'x' })} tooltip="Wartość przedsiębiorstwa / EBITDA. Neutralny wobec struktury kapitału — porównywalny między spółkami z różnym poziomem długu. < 10x = tanie." />}
          {pfcf           != null && <Row label="C/FCF"         value={fmtL(pfcf,     { decimals: 1, suffix: 'x' })} tooltip="Cena/Wolne Przepływy Pieniężne. FCF = gotówka po capexie. Dla spółek z wysokim capexem (jak Dino) może być wysoki — sprawdź C/Z jako alternatywę." />}
          {fcfYield       != null && <Row label="FCF Yield"     value={fmtL(fcfYield, { decimals: 2, suffix: '%' })} color={fcfYield > 0 ? '#10b981' : '#f43f5e'} tooltip="FCF / Kapitalizacja rynkowa. Odwrotność C/FCF. Powyżej 5% = atrakcyjne. To ile gotówki spółka generuje na każde 100 PLN kapitalizacji." />}
          {raw?.priceToBook != null && <Row label="C/WK (P/B)"  value={fmtL(raw.priceToBook, { decimals: 2, suffix: 'x' })} tooltip="Cena/Wartość księgowa. P/B < 1 = akcja tańsza niż wartość aktywów netto. Wysoki P/B = silna marka lub dźwignia operacyjna." />}
          {raw?.pegRatio    != null && <Row label="PEG"          value={fmtL(raw.pegRatio,    { decimals: 2 })} tooltip="PEG = C/Z ÷ stopa wzrostu EPS. PEG < 1 = akcja tania względem wzrostu. Uwzględnia przyszły wzrost przy wycenie." />}
          {liveMarketCap    != null && <Row label="Kap. rynkowa" value={fmtLargeL(liveMarketCap)} />}
          {liveEV           != null && <Row label="EV"           value={fmtLargeL(liveEV)} tooltip="Enterprise Value = Kapitalizacja + Dług netto. Pełna cena przejęcia spółki. Używany w EV/EBITDA." />}
          {(raw?.epsRevisionsUp30d != null || raw?.epsRevisionsDown30d != null) && (
            <Row
              label="Rewizje EPS (30d)"
              value={`↑${raw.epsRevisionsUp30d ?? 0} ↓${raw.epsRevisionsDown30d ?? 0}`}
              color={(raw.epsRevisionsUp30d ?? 0) > (raw.epsRevisionsDown30d ?? 0) ? '#10b981' : (raw.epsRevisionsDown30d ?? 0) > (raw.epsRevisionsUp30d ?? 0) ? '#f43f5e' : undefined}
              tooltip="Ile analityków podwyższyło (↑) lub obniżyło (↓) prognozy EPS w ostatnich 30 dniach. Pozytywny sygnał gdy wzrostów jest więcej."
            />
          )}
          {raw?.forwardRevenueEstimate != null && (
            <Row label="Prognoza przychodów (nast. rok)" value={fmtLargeL(raw.forwardRevenueEstimate)} />
          )}
        </Section>
      )}

      {hasFundamentals && (
        <Section title="Fundamenty">
          {raw?.ttmRevenue != null && (
            <Row
              label={raw?.revenueGrowthYoY != null
                ? `Przychody TTM (${raw.revenueGrowthYoY >= 0 ? '+' : ''}${(raw.revenueGrowthYoY * 100).toFixed(1)}% r/r)`
                : 'Przychody TTM'}
              value={fmtLargeL(raw.ttmRevenue)}
              color={raw?.revenueGrowthYoY != null ? (raw.revenueGrowthYoY >= 0 ? '#10b981' : '#f43f5e') : undefined}
            />
          )}
          {raw?.bookPerShare != null && <Row label="Wartość księgowa/akcję" value={fmtL(raw.bookPerShare, { decimals: 2 })} />}
          {netMargin != null && <Row label="Marża netto" value={fmtL(netMargin * 100, { decimals: 1, suffix: '%' })} color={netMargin > 0 ? '#10b981' : '#f43f5e'} tooltip="Zysk netto / Przychody. Ile zostaje po wszystkich kosztach z każdego 1 PLN sprzedaży. Dla retailerów typowe 1–5%." />}
        </Section>
      )}

      <GrowthDrivers symbol={symbol} roic={roic} />

      {(hasProfit || raw?.beta != null || yearChangePct != null) && (
        <Section title="Zysk / Ryzyko">
          {epsTtm          != null && <Row label="EPS (TTM)"     value={fmtL(epsTtm, { decimals: 2 })} tooltip="Zysk na akcję za ostatnie 12 miesięcy. Używany do obliczenia C/Z. Rosnący EPS = dobry znak." />}
          {raw?.forwardEps != null && <Row label="EPS (forward)" value={fmtL(raw.forwardEps, { decimals: 2 })} tooltip="Prognozowany zysk na akcję na następne 12 miesięcy (konsensus analityków)." />}
          {raw?.beta       != null && <Row label="Beta"          value={fmtL(raw.beta, { decimals: 2 })} tooltip="Zmienność akcji względem rynku. Beta = 1 = ruch jak rynek. Beta > 1 = bardziej zmienne. Beta < 1 = defensywna." />}
          {yearChangePct   != null && (
            <Row
              label="Zmiana 1 rok"
              value={`${yearChangePct >= 0 ? '+' : ''}${yearChangePct.toFixed(1)}%`}
              color={yearChangePct >= 0 ? '#10b981' : '#f43f5e'}
            />
          )}
        </Section>
      )}

      {hasDividend && (
        <Section title="Dywidenda">
          <Row label="Stopa dywidendowa" value={raw.dividendYield != null ? fmtL(raw.dividendYield, { percent: true, suffix: '%' }) : '—'} tooltip="Roczna dywidenda / cena akcji. Dochód pasywny z akcji. Powyżej 4% = atrakcyjne, ale sprawdź czy spółka nie płaci więcej niż zarabia." />
          {raw.dividendRate != null && <Row label="DPS" value={fmtL(raw.dividendRate)} tooltip="Dywidenda na akcję (Dividend Per Share) za ostatnie 12 miesięcy." />}
          {raw?.payoutRatio != null && (
            <Row
              label="Payout Ratio"
              value={`${(raw.payoutRatio * 100).toFixed(0)}%`}
              color={raw.payoutRatio > 1 ? '#f43f5e' : raw.payoutRatio > 0.7 ? '#f59e0b' : '#10b981'}
              tooltip="Udział dywidendy w zysku netto. > 100% = spółka płaci więcej niż zarabia (niezrównoważone). < 70% = bezpieczny poziom."
            />
          )}
          {raw?.exDividendDate && (
            <Row
              label="Data ex-dividend"
              value={new Date(raw.exDividendDate).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
              tooltip="Ostatni dzień, w którym trzeba posiadać akcje, aby otrzymać kolejną dywidendę."
            />
          )}
          {raw?.dividendGrowthStreak != null && raw?.dividendRate != null && (
            <Row
              label="Wzrost dywidendy z rzędu"
              value={raw.dividendGrowthStreak > 0 ? `${raw.dividendGrowthStreak} lat` : '0 lat'}
              color={raw.dividendGrowthStreak >= 5 ? '#10b981' : raw.dividendGrowthStreak >= 1 ? '#f59e0b' : undefined}
            />
          )}
        </Section>
      )}

      {has52W && (
        <Section title="52-tygodniowy zakres">
          <Row label="Min"  value={fmtL(low52,  { decimals: 2 })} />
          <Row label="Maks" value={fmtL(high52, { decimals: 2 })} />
          {pct52 != null && (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fmtL(low52, { decimals: 2 })}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fmtL(high52, { decimals: 2 })}</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--panel-2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct52))}%`, background: 'var(--accent)', borderRadius: 2 }} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                Kurs: {pct52.toFixed(0)}% zakresu
              </div>
            </div>
          )}
        </Section>
      )}

      {hasAnalysts && (
        <Section title="Analitycy">
          {raw.targetMeanPrice != null && <Row label="Cel (średni)" value={fmtL(raw.targetMeanPrice, { decimals: 2 })} />}
          {raw.targetLowPrice  != null && raw.targetHighPrice != null && (
            <Row label="Cel (min–maks)" value={`${fmtL(raw.targetLowPrice, { decimals: 2 })} – ${fmtL(raw.targetHighPrice, { decimals: 2 })}`} />
          )}
          {raw.numberOfAnalystOpinions != null && <Row label="Analityków" value={String(raw.numberOfAnalystOpinions)} />}
          {rec && <Row label="Rekomendacja" value={rec[0]} color={rec[1]} />}
          {raw.nextEarningsDate != null && <Row label="Nast. wyniki" value={fmtDateL(raw.nextEarningsDate)} />}
        </Section>
      )}

      {hasFundamentalValuation && (
        <Section title="Wycena Fundamentalna">
          <ValuationGauge
            currentPrice={livePrice}
            dcfValue={raw?.dcfFairValue}
            analystTarget={raw?.targetMeanPrice}
          />
          {analystUpside != null && (
            <Row
              label="Cel analityków (śr.)"
              value={`${fmtL(raw.targetMeanPrice, { decimals: 2 })}  ${analystUpside >= 0 ? '+' : ''}${analystUpside.toFixed(1)}% ${analystUpside >= 0 ? '▲' : '▼'}`}
              color={analystUpside >= 0 ? '#10b981' : '#f43f5e'}
            />
          )}
          {dcfUpside != null && (
            <Row
              label="Wycena DCF"
              value={fmtL(raw.dcfFairValue, { decimals: 2 })}
              color={dcfUpside <= 0 ? '#008751' : '#f43f5e'}
            />
          )}
        </Section>
      )}

      <PeerComparison dinoPE={peRatio} dinoNetMargin={netMargin} />

      {hasChecklist && (
        <InvestmentChecklist psRatio={psRatio} roic={roic} netDebtEbitda={netDebtEbitda} />
      )}

      {hasDuPont && (
        <DuPontAnalysis
          netMargin={netMargin}
          assetTurnover={assetTurnover}
          leverage={leverageRatio}
          roe={roe}
        />
      )}

      {hasHealth && (
        <Section title="Kondycja finansowa">
          {gScore  != null && <HealthBar label="Wzrost"        score={gScore} />}
          {pScore  != null && <HealthBar label="Rentowność"    score={pScore}  tooltip={isCompounder ? COMPOUNDER_TOOLTIP : undefined} />}
          {cfScore != null && <HealthBar label="Przepływy FCF" score={cfScore} tooltip={isCompounder ? COMPOUNDER_TOOLTIP : undefined} />}
        </Section>
      )}

    </div>
  );
}
