// frontend-react/src/pages/ScenarioLab.jsx
import { useRef, useEffect, useState, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import { RotateCcw, Search, X } from 'lucide-react';
import Annotation from 'chartjs-plugin-annotation';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import { fetchOptionChain, getMdApiKey } from '../services/MarketDataService';
import {
  calcSigma, makePrices, calcPayoff, calcKPIs, calcGreeks,
} from '../utils/scenarioLab';
import { runway } from '../utils/runway.js';
import { Badge, Button, Card, Field, Input, Select, Stat, Table } from '../components/ui';
import { cx } from '../components/ui/cx.js';

function dteToDateStr(days) {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(1, days));
  return d.toISOString().slice(0, 10);
}

function dateStrToDte(str) {
  if (!str) return 1;
  const diff = Math.round((new Date(str) - new Date()) / 86400000);
  return Math.max(1, diff);
}

Chart.register(...registerables, Annotation);

const STRATEGIES = [
  { value: 'long-call',        label: 'Long Call' },
  { value: 'long-put',         label: 'Long Put' },
  { value: 'covered-call',     label: 'Covered Call' },
  { value: 'protective-put',   label: 'Protective Put' },
  { value: 'csp',              label: 'Cash-Secured Put' },
  { value: 'bull-call-spread', label: 'Bull Call Spread' },
  { value: 'bear-put-spread',  label: 'Bear Put Spread' },
  { value: 'iron-condor',      label: 'Iron Condor' },
];

const PRESETS = [
  { label: 'CDR (CD Projekt)', strategy: 'long-call', entry: 230, strike: 250, premium: 8.50, dte: 45, iv: 35 },
  { label: 'AAPL (Apple)',     strategy: 'long-call', entry: 200, strike: 210, premium: 4.20, dte: 30, iv: 25 },
  { labelKey: 'scenario_preset_spec', strategy: 'long-call', entry: 100, strike: 120, premium: 2.50, dte: 60, iv: 45 },
  { labelKey: 'scenario_preset_hedge', strategy: 'long-put',  entry: 150, strike: 145, premium: 5.00, dte: 30, iv: 20 },
];

const SPREAD_STRATEGIES = new Set(['bull-call-spread','bear-put-spread','iron-condor']);
const WING_STRATEGIES   = new Set(['iron-condor']);
const HEDGED_STRATEGIES = new Set(['covered-call','protective-put']);

const STRIKE_LABELS = {
  'long-call':        'Strike Call ($)',
  'long-put':         'Strike Put ($)',
  'covered-call':     'Strike Call ($)',
  'protective-put':   'Strike Put ($)',
  'csp':              'Strike Put ($)',
  'bull-call-spread': 'Long Call Strike ($)',
  'bear-put-spread':  'Long Put Strike ($)',
  'iron-condor':      'Short Put Strike ($)',
};

const STRIKE2_LABELS = {
  'bull-call-spread': 'Short Call Strike ($)',
  'bear-put-spread':  'Short Put Strike ($)',
  'iron-condor':      'Short Call Strike ($)',
};

const PREMIUM_LABELS = {
  'bull-call-spread': 'Net Debit ($)',
  'bear-put-spread':  'Net Debit ($)',
  'iron-condor':      'Net Credit ($)',
};

function fmtDollar(n) {
  if (isNaN(n)) return '—';
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-$' : '$') + abs;
}

// Opcje w łańcuchu: „$strike · mid · IV · Δ".
function contractLabel(c) {
  return `$${c.strike} · mid ${c.mid != null ? `$${c.mid.toFixed(2)}` : '—'} · IV ${c.iv != null ? `${(c.iv * 100).toFixed(0)}%` : '—'} · Δ ${c.delta != null ? c.delta.toFixed(2) : '—'}`;
}

export default function ScenarioLab() {
  const { portfolio } = useApp();
  const t = useT();
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  // Motyw ustawia Layout atrybutem data-theme — przerysowujemy wykres
  // w kolorach nowego motywu (jak w Kalkulatorze OKI).
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme'));
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(document.documentElement.getAttribute('data-theme')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const [strategy, setStrategy] = useState('long-call');
  const [entry,    setEntry]    = useState(100);
  const [qty,      setQty]      = useState(1);
  const [strike,   setStrike]   = useState(105);
  const [strike2,  setStrike2]  = useState(110);
  const [premium,  setPremium]  = useState(3.50);
  const [dte,      setDte]      = useState(30);
  const [expiryDate, setExpiryDate] = useState(() => dteToDateStr(30));
  const [iv,       setIv]       = useState(30);
  const [wing,     setWing]     = useState(5);
  const [hideStock, setHideStock] = useState(false);

  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [livePrice,      setLivePrice]      = useState(null);
  const [fetchingPrice,  setFetchingPrice]  = useState(false);

  const [chain,          setChain]          = useState(null);
  const [chainLoading,   setChainLoading]   = useState(false);
  const [chainError,     setChainError]     = useState(null);
  const [chainTicker,    setChainTicker]    = useState('');
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [selectedSym1,   setSelectedSym1]   = useState('');
  const [selectedSym2,   setSelectedSym2]   = useState('');

  useEffect(() => {
    if (!selectedSymbol) { setLivePrice(null); return; }
    const pos = portfolio.find(p => p.symbol === selectedSymbol);
    setFetchingPrice(true);
    fetch(`/api/finnhub/v1/quote?symbol=${selectedSymbol}`, {
      })
      .then(r => r.json())
      .then(data => {
        const price = data?.c > 0 ? data.c : pos?.avgPrice ?? 100;
        setLivePrice(data?.c > 0 ? data.c : null);
        setEntry(price);
        // Liczba akcji z portfela ma sens tylko tam, gdzie qty oznacza akcje
        // (covered call, protective put). Wcześniej trafiała też do strategii
        // czysto opcyjnych, gdzie qty to kontrakty — 100 akcji dawało 100
        // kontraktów, czyli wynik ×100.
        if (pos && HEDGED_STRATEGIES.has(strategy)) {
          setQty(Math.round(pos.qty) || 1);
        }
        // suggested strike near ATM
        setStrike(parseFloat((price * 1.05).toFixed(2)));
        setStrike2(parseFloat((price * 1.10).toFixed(2)));
      })
      .catch(() => {
        if (pos) { setEntry(pos.avgPrice); setStrike(parseFloat((pos.avgPrice * 1.05).toFixed(2))); }
      })
      .finally(() => setFetchingPrice(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol]);

  const expiryContracts = chain
    ? chain.contracts.filter(c => c.expiry === selectedExpiry)
    : [];

  const leg1Side = ['long-put','protective-put','csp','bear-put-spread'].includes(strategy) ? 'put'
                 : strategy === 'iron-condor' ? 'put'
                 : 'call';
  const leg2Side = ['bull-call-spread','iron-condor'].includes(strategy) ? 'call' : 'put';

  const leg1Contracts = expiryContracts.filter(c => c.side === leg1Side);
  const leg2Contracts = expiryContracts.filter(c => c.side === leg2Side);

  async function handleFetchChain() {
    const ticker = (chainTicker || selectedSymbol || '').toUpperCase().trim();
    if (!ticker) { setChainError(t('scenario_err_enter_ticker')); return; }
    if (!getMdApiKey()) { setChainError(t('scenario_err_no_api')); return; }
    setChainLoading(true);
    setChainError(null);
    setChain(null);
    setSelectedExpiry('');
    setSelectedSym1('');
    setSelectedSym2('');
    try {
      const data = await fetchOptionChain(ticker);
      setChain(data);
      if (data.expirations.length) setSelectedExpiry(data.expirations[0]);
    } catch (e) {
      setChainError(e.message);
    } finally {
      setChainLoading(false);
    }
  }

  function applyContract(sym, isLeg2 = false) {
    const c = chain?.contracts.find(x => x.optionSymbol === sym);
    if (!c) return;
    if (!isLeg2) {
      setSelectedSym1(sym);
      setStrike(c.strike);
      if (c.dte != null) { setDte(c.dte); setExpiryDate(dteToDateStr(c.dte)); }
      if (c.iv  != null) setIv(Math.round(c.iv * 100));
      if (!SPREAD_STRATEGIES.has(strategy)) {
        const mid = c.mid ?? (c.bid != null && c.ask != null ? (c.bid + c.ask) / 2 : null);
        if (mid != null) setPremium(parseFloat(mid.toFixed(2)));
      }
    } else {
      setSelectedSym2(sym);
      setStrike2(c.strike);
    }

    const sym1 = isLeg2 ? selectedSym1 : sym;
    const sym2 = isLeg2 ? sym : selectedSym2;
    if (SPREAD_STRATEGIES.has(strategy) && sym1 && sym2) {
      const c1 = chain.contracts.find(x => x.optionSymbol === sym1);
      const c2 = chain.contracts.find(x => x.optionSymbol === sym2);
      if (c1 && c2) {
        if (c1.dte != null) { setDte(c1.dte); setExpiryDate(dteToDateStr(c1.dte)); }
        if (c1.iv  != null) setIv(Math.round(c1.iv * 100));
        const mid1 = c1.mid ?? (c1.bid != null && c1.ask != null ? (c1.bid + c1.ask) / 2 : 0);
        const mid2 = c2.mid ?? (c2.bid != null && c2.ask != null ? (c2.bid + c2.ask) / 2 : 0);
        if (strategy === 'iron-condor') {
          const longPut  = chain.contracts.find(x => x.side === 'put'  && Math.abs(x.strike - (c1.strike - wing)) < 0.01 && x.expiry === c1.expiry);
          const longCall = chain.contracts.find(x => x.side === 'call' && Math.abs(x.strike - (c2.strike + wing)) < 0.01 && x.expiry === c2.expiry);
          const lp = longPut?.mid  ?? longPut?.ask  ?? 0;
          const lc = longCall?.mid ?? longCall?.ask ?? 0;
          setPremium(parseFloat(Math.max(0, mid1 + mid2 - lp - lc).toFixed(2)));
        } else {
          setPremium(parseFloat(Math.max(0, mid1 - mid2).toFixed(2)));
        }
      }
    }
  }

  function applyPreset(preset) {
    setStrategy(preset.strategy);
    setEntry(preset.entry);
    setStrike(preset.strike);
    setPremium(preset.premium);
    setDte(preset.dte);
    setExpiryDate(dteToDateStr(preset.dte));
    setIv(preset.iv);
  }

  function resetParams() {
    const base = livePrice ?? entry;
    setIv(30);
    setDte(30);
    setExpiryDate(dteToDateStr(30));
    setPremium(3.50);
    setQty(1);
    if (livePrice) {
      setEntry(livePrice);
      setStrike(parseFloat((livePrice * 1.05).toFixed(2)));
      setStrike2(parseFloat((livePrice * 1.10).toFixed(2)));
    } else {
      setStrike(parseFloat((base * 1.05).toFixed(2)));
      setStrike2(parseFloat((base * 1.10).toFixed(2)));
    }
  }

  const isSpread = SPREAD_STRATEGIES.has(strategy);
  const isWing   = WING_STRATEGIES.has(strategy);
  const isHedged = HEDGED_STRATEGIES.has(strategy);

  const [kpis,   setKpis]   = useState(null);
  const [greeks, setGreeks] = useState(null);
  const [sigma,  setSigma]  = useState(null);

  const renderChart = useCallback(() => {
    if (!canvasRef.current) return;

    const isSpreadLocal = SPREAD_STRATEGIES.has(strategy);
    const isHedgedLocal = HEDGED_STRATEGIES.has(strategy);

    const ivDec  = iv / 100;
    const T      = dte / 365;
    const sig    = calcSigma(entry, ivDec, dte);
    const prices = makePrices(entry, ivDec, dte);

    const params = { entry, qty, strike, strike2, premium, T, iv: ivDec, wing };
    const { expiry, t0, stock } = calcPayoff(strategy, prices, params);
    const kpisCalc   = calcKPIs(strategy, params);
    const greeksCalc = calcGreeks(strategy, params);

    setKpis(kpisCalc);
    setGreeks(greeksCalc);
    setSigma(sig);

    // Find index of price closest to target
    const findIdx = (target) => prices.reduce((best, p, i) =>
      Math.abs(p - target) < Math.abs(prices[best] - target) ? i : best, 0);

    const labels   = prices.map(p => '$' + p.toFixed(0));
    const datasets = [];
    // Kolory z tokenów motywu — wcześniej na sztywno jasne napisy i białe
    // linie siatki, w jasnym motywie niewidoczne.
    const css = getComputedStyle(document.documentElement);
    const v = name => css.getPropertyValue(name).trim();
    const text = v('--text'), dim = v('--text-faint'), grid = v('--border');
    const accent = v('--accent'), info = v('--info');

    if ((isHedgedLocal || isSpreadLocal) && !hideStock) {
      datasets.push({
        label: t('scenario_stock_only'),
        data: stock,
        borderColor: info,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 4],
        pointRadius: 0,
        tension: 0.1,
      });
    }

    datasets.push({
      label: STRATEGIES.find(s => s.value === strategy)?.label || strategy,
      data: expiry,
      borderColor: accent,
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.1,
    });

    datasets.push({
      label: t('scenario_today_t0'),
      data: t0,
      borderColor: dim,
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [4, 3],
      pointRadius: 0,
      tension: 0.3,
    });

    const annotations = {
      entryLine: {
        type: 'line', xMin: findIdx(entry), xMax: findIdx(entry),
        borderColor: dim, borderWidth: 1, borderDash: [2, 4],
        label: { content: 'Entry', display: true, color: text, backgroundColor: 'transparent', font: { size: 10 }, position: 'start' },
      },
      sigma1Lo: {
        type: 'line', xMin: findIdx(entry - sig), xMax: findIdx(entry - sig),
        borderColor: info, borderWidth: 1, borderDash: [4, 4],
        label: { content: '-1σ', display: true, color: info, backgroundColor: 'transparent', font: { size: 10 }, position: 'start' },
      },
      sigma1Hi: {
        type: 'line', xMin: findIdx(entry + sig), xMax: findIdx(entry + sig),
        borderColor: info, borderWidth: 1, borderDash: [4, 4],
        label: { content: '+1σ', display: true, color: info, backgroundColor: 'transparent', font: { size: 10 }, position: 'start' },
      },
    };

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: text, font: { size: 12, weight: '600' } } },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmtDollar(ctx.parsed.y) } },
          annotation: { annotations },
        },
        scales: {
          x: { ticks: { color: dim, maxTicksLimit: 10 }, grid: { color: grid } },
          y: {
            ticks: { color: dim, callback: val => fmtDollar(val) },
            grid: { color: grid },
            title: { display: true, text: t('scenario_pnl_axis'), color: dim, font: { size: 11 } },
          },
        },
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy, entry, qty, strike, strike2, premium, dte, iv, wing, hideStock, theme, t]);

  useEffect(() => {
    renderChart();
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [renderChart]);

  // Bear put spread wymaga krótkiego strike'u poniżej długiego, pozostałe
  // spready — powyżej. Przy odwrotnej kolejności wzory dają bzdury (np.
  // ujemny „maks. zysk"), więc lepiej to powiedzieć wprost.
  const strikeOrderError = isSpread && (strategy === 'bear-put-spread' ? strike2 >= strike : strike2 <= strike)
    ? t(strategy === 'bear-put-spread' ? 'scenario_strike2_below' : 'scenario_strike2_above')
    : undefined;
  const leg1Label = strategy === 'iron-condor' ? 'Short Put' : isSpread ? t('scenario_long_leg') : t('scenario_contract');
  const contractSelect = (label, value, contracts, isLeg2) => (
    <Field label={label}>
      <Select value={value} onChange={e => applyContract(e.target.value, isLeg2)}>
        <option value="">{t('scenario_choose_strike')}</option>
        {contracts.map(c => <option key={c.optionSymbol} value={c.optionSymbol}>{contractLabel(c)}</option>)}
      </Select>
    </Field>
  );
  const num = (value, set, fallback, props = {}) => (
    <Input type="number" value={value} onChange={e => set(parseFloat(e.target.value) || fallback)} {...props} />
  );

  return (
    <div className="space-y-4">
      {/* Gotowe przykłady */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small text-faint">{t('scenario_presets')}</span>
        {PRESETS.map(preset => (
          <Button key={preset.label ?? preset.labelKey} size="sm" onClick={() => applyPreset(preset)}>
            {preset.label ?? t(preset.labelKey)}
          </Button>
        ))}
        <Button size="sm" variant="ghost" icon={RotateCcw} className="ml-auto" onClick={resetParams}>{t('scenario_reset')}</Button>
      </div>

      {/* Spółka i łańcuch opcji */}
      <Card title={t('scenario_stock_chain')}>
        <div className="grid gap-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('scenario_portfolio_stock')}>
              <Select
                value={selectedSymbol}
                onChange={e => { setSelectedSymbol(e.target.value); if (e.target.value) setChainTicker(e.target.value); }}
              >
                <option value="">{t('scenario_own_values')}</option>
                {portfolio.map(pos => (
                  <option key={pos.id ?? pos.symbol} value={pos.symbol}>
                    {pos.symbol}{pos.name && pos.name !== pos.symbol ? ` — ${pos.name}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('scenario_ticker_option')}>
              <div className="flex gap-2">
                <Input
                  aria-label={t('scenario_ticker_option')}
                  className="min-w-0 flex-1 font-mono uppercase"
                  value={chainTicker}
                  onChange={e => setChainTicker(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleFetchChain()}
                  placeholder={t('scenario_ticker_placeholder')}
                />
                <Button variant="primary" icon={Search} loading={chainLoading} onClick={handleFetchChain}>{t('scenario_fetch_chain')}</Button>
              </div>
            </Field>
          </div>
          {(fetchingPrice || livePrice != null || selectedSymbol || chain || chainError) && (
            <div className="flex flex-wrap items-center gap-2 text-small">
              {fetchingPrice && <span className="animate-pulse text-dim">{t('scenario_fetching_price')}</span>}
              {livePrice != null && !fetchingPrice && (
                <Badge tone="info">{selectedSymbol} {livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Badge>
              )}
              {chain && !chainLoading && (
                <Badge tone="up">{chain.contracts.length} {t('scenario_contracts_count')} ({chain.expirations.length} {t('scenario_dates_count')})</Badge>
              )}
              {chainError && <span className="text-down">{chainError}</span>}
              {selectedSymbol && !fetchingPrice && (
                <Button size="sm" variant="ghost" icon={X} className="ml-auto" onClick={() => setSelectedSymbol('')}>{t('scenario_clear')}</Button>
              )}
            </div>
          )}

          {chain && (
            <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
              <Field label={t('scenario_expiry')}>
                <Select value={selectedExpiry} onChange={e => { setSelectedExpiry(e.target.value); setSelectedSym1(''); setSelectedSym2(''); }}>
                  {chain.expirations.map(exp => {
                    const c = chain.contracts.find(x => x.expiry === exp);
                    return <option key={exp} value={exp}>{exp}{c?.dte != null ? ` (${c.dte}d)` : ''}</option>;
                  })}
                </Select>
              </Field>
              {contractSelect(leg1Label, selectedSym1, leg1Contracts, false)}
              {isSpread && contractSelect(strategy === 'iron-condor' ? 'Short Call' : t('scenario_short_leg'), selectedSym2, leg2Contracts, true)}
            </div>
          )}
        </div>
      </Card>

      {/* Parametry */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <Card title={t('scenario_basic_params')}>
          <div className="grid gap-3 p-4">
            <Field label={t('scenario_strategy_label')}>
              <Select value={strategy} onChange={e => setStrategy(e.target.value)}>
                {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
            <Field
              label={t('scenario_entry_price')}
              error={strategy === 'covered-call' && livePrice != null && Math.abs((entry - livePrice) / livePrice) > 0.15
                ? `${t('scenario_price_warning')} (${livePrice.toFixed(2)})` : undefined}
            >
              {num(entry, setEntry, 100, { min: '0.01', step: '0.01' })}
            </Field>
            {/* Pole zawsze widoczne — wcześniej przy spreadach było ukryte,
                a ukryta wartość (np. 50 z poprzedniej strategii) dalej
                mnożyła wynik. */}
            <Field label={isHedged ? t('scenario_qty_shares') : t('scenario_qty_contracts')}>
              <Input type="number" value={qty} min="1" step="1" onChange={e => setQty(parseInt(e.target.value) || 1)} />
            </Field>
            <label className="flex cursor-pointer select-none items-center gap-2 text-small text-dim">
              <input type="checkbox" checked={hideStock} onChange={e => setHideStock(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--accent)]" />
              {t('scenario_hide_stock')}
            </label>
          </div>
        </Card>

        <Card title={t('scenario_option_params')}>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label={STRIKE_LABELS[strategy] || 'Strike ($)'}>
              {num(strike, setStrike, 100, { min: '0.01', step: '0.01' })}
            </Field>
            {isSpread && (
              <Field label={STRIKE2_LABELS[strategy] || 'Strike 2 ($)'} error={strikeOrderError}>
                {num(strike2, setStrike2, 110, { min: '0.01', step: '0.01' })}
              </Field>
            )}
            {isWing && (
              <Field label="Wing Width ($)">
                {num(wing, setWing, 5, { min: '0.5', step: '0.5' })}
              </Field>
            )}
            <Field label={PREMIUM_LABELS[strategy] || 'Premium ($ / option)'}>
              {num(premium, setPremium, 0, { min: '0', step: '0.01' })}
            </Field>
            <Field label={t('scenario_expiry_date').replace('{dte}', dte)}>
              <Input
                type="date"
                value={expiryDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => { setExpiryDate(e.target.value); setDte(dateStrToDte(e.target.value)); }}
              />
            </Field>
            <Field label="IV — Implied Volatility (%)">
              {num(iv, setIv, 30, { min: '1', max: '500', step: '1' })}
            </Field>
          </div>
        </Card>
      </div>

      {/* KPI */}
      {kpis && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.breakevens.length === 1 ? (
            <Stat label="Break-even" value={fmtDollar(kpis.breakevens[0])} />
          ) : (
            <>
              <Stat label={t('scenario_be_lower')} value={fmtDollar(kpis.breakevens[0])} />
              <Stat label={t('scenario_be_upper')} value={fmtDollar(kpis.breakevens[1])} />
            </>
          )}
          <Stat label={t('scenario_max_profit')} value={fmtDollar(kpis.maxProfit)} tone={kpis.maxProfit >= 0 ? 'up' : 'down'} />
          <Stat label={t('scenario_max_loss')} value={fmtDollar(kpis.maxLoss)} tone={kpis.maxLoss >= 0 ? 'up' : 'down'} />
          <Stat label="PoP" value={(kpis.pop * 100).toFixed(1) + '%'} />
          {kpis.bpe > 0 && <Stat label={t('scenario_bpe')} value={fmtDollar(kpis.bpe)} />}
          {kpis.moic != null && <Stat label="MOIC" value={kpis.moic.toFixed(2) + 'x'} />}
          {isFinite(kpis.maxProfit) && isFinite(kpis.maxLoss) && kpis.maxLoss !== 0 && (
            <Stat label="R/R Ratio" value={(Math.abs(kpis.maxProfit) / Math.abs(kpis.maxLoss)).toFixed(2) + ' : 1'} />
          )}
          {kpis.bpe > 0 && isFinite(kpis.maxProfit) && (
            <Stat label="Return on Capital" value={((kpis.maxProfit / kpis.bpe) * 100).toFixed(1) + '%'} tone={kpis.maxProfit >= 0 ? 'up' : 'down'} />
          )}
          {sigma != null && <Stat label={t('scenario_sigma_range')} value={'±$' + sigma.toFixed(2)} />}
        </div>
      )}

      {/* Wykres */}
      <Card>
        <div className="h-[360px] p-4">
          <canvas ref={canvasRef} />
        </div>
      </Card>

      {/* Grecy */}
      {greeks && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <Stat label="Δ Delta" value={greeks.posDelta.toFixed(3)} tone={greeks.posDelta >= 0 ? 'up' : 'down'} hint={t('scenario_delta_sub')} />
          <Stat label={t('scenario_theta_label')} value={greeks.posTheta.toFixed(4)} tone={greeks.posTheta >= 0 ? 'up' : 'down'} hint={t('scenario_theta_sub')} />
        </div>
      )}

      <RunwayCalculator />
    </div>
  );
}

function RunwayCalculator() {
  const t = useT();
  const { locale } = useLanguage();
  const [capital,    setCapital]    = useState(500000);
  const [monthly,    setMonthly]    = useState(5000);
  const [returnPct,  setReturnPct]  = useState(5);
  const [inflation,  setInflation]  = useState(3);

  const fmt = (n) => n.toLocaleString(locale, { maximumFractionDigits: 0 });

  const res = runway({ capital, monthly, returnPct, inflationPct: inflation });
  const r = (1 + returnPct / 100) / (1 + inflation / 100) - 1;
  const years  = res.eternal ? null : Math.floor(res.months / 12);
  const months = res.eternal ? null : res.months % 12;
  const tone = res.eternal || years >= 20 ? 'text-up' : years >= 10 ? 'text-warn' : 'text-down';

  const rows = [5, 10, 20, 30].map(yr => {
    const exhausted = !res.eternal && yr * 12 > res.months;
    const remaining = exhausted ? 0 : res.after(yr);
    return { yr, remaining: remaining > 0 ? remaining : 0 };
  });

  const input = (label, value, set, props) => (
    <Field label={label}>
      <Input type="number" value={value} onChange={e => set(parseFloat(e.target.value) || 0)} {...props} />
    </Field>
  );

  return (
    <Card title={t('runway_title')}>
      <div className="grid gap-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {input(t('runway_capital'), capital, setCapital, { min: '0', step: '10000' })}
          {input(t('runway_monthly_exp'), monthly, setMonthly, { min: '0', step: '100' })}
          {input(t('runway_return_pct'), returnPct, setReturnPct, { min: '0', max: '100', step: '0.5' })}
          {input(t('runway_inflation'), inflation, setInflation, { min: '0', max: '50', step: '0.5' })}
        </div>
        <div className="border-t border-line pt-4">
          {res.eternal ? (
            <div className="text-[20px] font-bold text-up">{t('runway_eternal')}</div>
          ) : (
            <>
              <div className={cx('text-[28px] font-extrabold tabular-nums', tone)}>
                {t('runway_years_months').replace('{y}', years).replace('{m}', months)}
              </div>
              <div className="mt-1 text-small text-dim">
                {t('runway_real_return')}: {t('runway_rate_line').replace('{r}', (r * 100).toFixed(2)).replace('{m}', (res.rm * 100).toFixed(3))}
              </div>
            </>
          )}
        </div>
      </div>
      <Table
        columns={[
          { key: 'yr', header: t('runway_year_col'), mobile: 'title', render: row => <span className="font-semibold text-fg">{row.yr}</span> },
          { key: 'remaining', header: t('runway_remaining_capital'), align: 'right', render: row => <span className="tabular-nums">{row.remaining > 0 ? `${fmt(row.remaining)} zł` : '—'}</span> },
          {
            key: 'status', header: t('runway_status_col'), align: 'right', mobile: 'aside',
            render: row => {
              const ratio = row.remaining / capital;
              return row.remaining <= 0
                ? <Badge tone="down">{t('runway_status_gone')}</Badge>
                : ratio >= 0.5 ? <Badge tone="up">{t('runway_status_ok')}</Badge> : <Badge tone="warn">{t('runway_status_low')}</Badge>;
            },
          },
        ]}
        rows={rows}
        rowKey={row => row.yr}
      />
    </Card>
  );
}
