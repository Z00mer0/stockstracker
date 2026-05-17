import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import Spinner from '../components/shared/Spinner';
import AddDividendModal from '../components/AddDividendModal';
import useDividendEvents from '../hooks/useDividendEvents';
import {
  fetchDividendHistory,
  calcAnnualDivPerShare,
  calcYoC,
  getTaxRate,
  getUsTaxRate,
  DIV_MODE_KEY,
} from '../services/dividendService';

const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };

const PL_MONTHS_FULL = [
  'Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
  'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień',
];

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMonthYear(ym) {
  const [y, m] = ym.split('-');
  return `${PL_MONTHS_FULL[parseInt(m) - 1]} ${y}`;
}

export default function Dividends() {
  const { transactions, loading, fxRates, portfolio } = useApp();
  const { isPrivate } = usePrivacy();

  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);

  const {
    manualDividends, allCalendarEvents,
    loading: divLoading, addDividend, editDividend, deleteDividend,
  } = useDividendEvents(symbols);

  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [isNet, setIsNet]           = useState(() => localStorage.getItem(DIV_MODE_KEY) === 'net');
  const [yocMap, setYocMap]         = useState({});
  const [yocLoading, setYocLoading] = useState(false);

  useEffect(() => {
    if (!portfolio.length) return;
    let cancelled = false;
    setYocLoading(true);
    Promise.all(
      portfolio.map(async pos => {
        const hist = await fetchDividendHistory(pos.symbol);
        const annual = calcAnnualDivPerShare(hist);
        return { symbol: pos.symbol, annual, yoc: calcYoC(annual, pos.avgPrice) };
      })
    ).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(r => { map[r.symbol] = r; });
      setYocMap(map);
      setYocLoading(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(',')]);

  function toggleNetMode() {
    const next = !isNet;
    setIsNet(next);
    localStorage.setItem(DIV_MODE_KEY, next ? 'net' : 'gross');
  }

  const today = new Date().toISOString().slice(0, 10);

  const yearCutoff = useMemo(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const in30cutoff = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const dividends = useMemo(() =>
    [...transactions.filter(t => t.type === 'DIV')].sort((a, b) => b.date.localeCompare(a.date)),
    [transactions]
  );

  const grossPLN = (d) => (d.price || 0) * (d.qty || 1) * (fxRates[d.currency] ?? 1);
  const netPLN   = (d) => grossPLN(d) * (1 - getTaxRate(d.symbol, d.currency));
  const dispPLN  = (d) => isNet ? netPLN(d) : grossPLN(d);

  const annualDivPLN = useMemo(() =>
    dividends.filter(d => d.date >= yearCutoff).reduce((s, d) => s + dispPLN(d), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dividends, fxRates, isNet, yearCutoff]
  );

  const totalPLN = useMemo(() =>
    dividends.reduce((s, d) => s + dispPLN(d), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dividends, fxRates, isNet]
  );

  const upcoming = useMemo(() =>
    allCalendarEvents.filter(e => e.date >= today), [allCalendarEvents, today]
  );

  const upcoming30d = useMemo(() =>
    allCalendarEvents.filter(e => e.date >= today && e.date <= in30cutoff),
    [allCalendarEvents, today, in30cutoff]
  );

  const portfolioYield = useMemo(() => {
    let totalAnnualDiv = 0, totalValue = 0;
    portfolio.forEach(pos => {
      const data = yocMap[pos.symbol];
      if (!data?.annual) return;
      const rate = fxRates[pos.currency] ?? 1;
      totalAnnualDiv += pos.qty * data.annual * rate;
      totalValue += pos.qty * (pos.price ?? pos.avgPrice) * rate;
    });
    return totalValue > 0 ? (totalAnnualDiv / totalValue) * 100 : null;
  }, [portfolio, yocMap, fxRates]);

  const bySymbol = useMemo(() => {
    const map = {};
    dividends.forEach(d => {
      const key = d.symbol ?? 'INNE';
      if (!map[key]) map[key] = { symbol: key, name: d.name, totalPLN: 0, count: 0 };
      map[key].totalPLN += dispPLN(d);
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.totalPLN - a.totalPLN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dividends, fxRates, isNet]);

  const timeline = useMemo(() => {
    const byMonth = {};
    [...dividends].reverse().forEach(d => {
      const ym = d.date.slice(0, 7);
      if (!byMonth[ym]) byMonth[ym] = { ym, items: [], totalPLN: 0 };
      const amount = dispPLN(d);
      byMonth[ym].items.push({ ...d, dispPLN: amount });
      byMonth[ym].totalPLN += amount;
    });
    return Object.values(byMonth).sort((a, b) => b.ym.localeCompare(a.ym));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dividends, fxRates, isNet]);

  function openEdit(div) { setEditTarget(div); setModalOpen(true); }
  function handleSave(formData) {
    if (editTarget) editDividend(editTarget.id, formData); else addDividend(formData);
    setEditTarget(null);
  }
  function handleCloseModal() { setModalOpen(false); setEditTarget(null); }

  if (loading && !transactions.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  const modeLabel = isNet ? 'netto' : 'brutto';

  return (
    <div className="space-y-5">

      {/* ── Stats panel ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-yellow-800/50 bg-yellow-950/30 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">
            Dywidendy (12 mies.) · {modeLabel}
          </p>
          <p className={`text-2xl font-bold text-yellow-400${isPrivate ? ' privacy-blur' : ''}`}>
            {fmt(annualDivPLN)} zł
          </p>
          <p className="text-xs text-slate-600 mt-0.5">ostatnie 12 miesięcy</p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-2">
            Yield portfela (proj.)
            {yocLoading && <Spinner size="sm" />}
          </p>
          {portfolioYield != null ? (
            <p className={`text-2xl font-bold text-emerald-400${isPrivate ? ' privacy-blur' : ''}`}>
              {fmt(portfolioYield, 2)}%
            </p>
          ) : (
            <p className="text-2xl font-bold text-slate-600">—</p>
          )}
          <p className="text-xs text-slate-600 mt-0.5">roczne dywidendy / wartość portfela</p>
        </div>

        <div className="rounded-xl border border-indigo-800/50 bg-indigo-950/30 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Nadchodzące (30 dni)</p>
          <p className="text-2xl font-bold text-indigo-400">{upcoming30d.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {upcoming30d.length > 0
              ? upcoming30d.map(e => e.symbol).join(', ')
              : 'brak zaplanowanych'}
          </p>
        </div>
      </div>

      {/* ── Netto / Brutto toggle ── */}
      <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 px-5 py-3">
        <div>
          <p className="text-sm font-medium text-slate-300">Tryb wyświetlania kwot</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {isNet
              ? `Po podatku: GPW 19%, US ${getUsTaxRate() === 0.30 ? '30' : '15'}% (zmień w Ustawienia)`
              : 'Kwoty brutto — przed potrąceniem podatku'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm ${!isNet ? 'text-slate-200 font-medium' : 'text-slate-500'}`}>Brutto</span>
          <button
            onClick={toggleNetMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isNet ? 'bg-indigo-600' : 'bg-slate-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isNet ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className={`text-sm ${isNet ? 'text-indigo-400 font-medium' : 'text-slate-500'}`}>Netto</span>
        </div>
      </div>

      {/* ── Banner + dodaj GPW ── */}
      <div className="rounded-xl border border-blue-800/50 bg-blue-950/30 px-5 py-4 flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-blue-300 leading-relaxed max-w-lg">
          <span className="font-semibold">ℹ️ Daty dywidend GPW</span> (XTB.WA, VOT.WA itp.) są dodawane ręcznie.
          Daty US (NVDA, HOOD itp.) pobierane automatycznie z Finnhub.
        </p>
        <button
          onClick={() => { setEditTarget(null); setModalOpen(true); }}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          + Dodaj dywidendę GPW
        </button>
      </div>

      {/* ── Nadchodzące dywidendy ── */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Nadchodzące dywidendy</h2>
          <div className="flex items-center gap-3">
            {divLoading && <Spinner size="sm" />}
            <button
              onClick={() => { setEditTarget(null); setModalOpen(true); }}
              className="text-xs px-2.5 py-1 rounded-md bg-indigo-700 hover:bg-indigo-600 text-white transition-colors"
            >+ Dodaj ręcznie</button>
          </div>
        </div>

        {divLoading && !upcoming.length ? (
          <div className="flex justify-center py-8"><Spinner size="md" /></div>
        ) : upcoming.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500 text-sm">
            Brak nadchodzących dywidend.
            {symbols.some(s => !s.includes('.')) && (
              <span className="block mt-1 text-xs">US stocks: Finnhub może nie mieć danych dla tej spółki.</span>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                  <th className="text-left px-5 py-2.5">Spółka</th>
                  <th className="text-left px-5 py-2.5">Ex-date</th>
                  <th className="text-left px-5 py-2.5">Pay-date</th>
                  <th className="text-right px-5 py-2.5">Kwota/ak. ({modeLabel})</th>
                  <th className="text-left px-5 py-2.5">Źródło</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {upcoming.map((ev, i) => {
                  const cur = CUR_SYMBOLS[ev.currency] ?? ev.currency ?? '';
                  const taxRate = getTaxRate(ev.symbol, ev.currency);
                  const dispAmount = ev.amount != null
                    ? (isNet ? ev.amount * (1 - taxRate) : ev.amount)
                    : null;
                  return (
                    <tr key={ev.id ?? i} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-3 font-bold text-slate-100">💰 {ev.symbol}</td>
                      <td className="px-5 py-3 text-slate-300">{ev.date}</td>
                      <td className="px-5 py-3 text-slate-400">{ev.payDate ?? '—'}</td>
                      <td className={`px-5 py-3 text-right text-yellow-400 font-semibold${isPrivate ? ' privacy-blur' : ''}`}>
                        {dispAmount != null ? `${fmt(dispAmount)} ${cur}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {ev.isManual ? '✍️ ręczne' : '🤖 auto'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {ev.isManual && (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => { const src = manualDividends.find(d => d.id === ev.id); if (src) openEdit(src); }}
                              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                            >Edytuj</button>
                            <button
                              onClick={() => deleteDividend(ev.id)}
                              className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                            >Usuń</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Timeline wypłat ── */}
      {timeline.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300">Timeline wypłat</h2>
          </div>
          <div className="divide-y divide-slate-700/60">
            {timeline.map(({ ym, items, totalPLN: monthTotal }) => (
              <div key={ym}>
                <div className="px-5 py-2.5 bg-slate-900/40 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    {fmtMonthYear(ym)}
                  </span>
                  <span className={`text-xs font-semibold text-yellow-500${isPrivate ? ' privacy-blur' : ''}`}>
                    {fmt(monthTotal)} zł {modeLabel}
                  </span>
                </div>
                {items.map(d => (
                  <div key={d.id ?? d.date + d.symbol} className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-700/20 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-bold text-slate-200 shrink-0">{d.symbol}</span>
                      {d.name && d.name !== d.symbol && (
                        <span className="text-xs text-slate-500 truncate">{d.name}</span>
                      )}
                      <span className="text-xs text-slate-600 shrink-0">{d.date}</span>
                    </div>
                    <span className={`text-sm font-semibold text-yellow-400 shrink-0 ml-4${isPrivate ? ' privacy-blur' : ''}`}>
                      {fmt(d.dispPLN)} zł
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── KPI summary ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-yellow-800/50 bg-yellow-950/30 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Łącznie dywidendy ({modeLabel})</p>
          <p className={`text-2xl font-bold text-yellow-400${isPrivate ? ' privacy-blur' : ''}`}>{fmt(totalPLN)} zł</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Liczba wypłat</p>
          <p className="text-2xl font-bold text-slate-100">{dividends.length}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Spółki dywidendowe</p>
          <p className="text-2xl font-bold text-slate-100">{bySymbol.length}</p>
        </div>
      </div>

      {/* ── Per spółka + YoC ── */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Dywidendy per spółka · Yield on Cost</h2>
          {yocLoading && <Spinner size="sm" />}
        </div>

        {bySymbol.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 text-sm">
            <div className="text-4xl mb-3">🌱</div>
            <p className="text-slate-400 font-semibold">Brak spółek dywidendowych w portfelu</p>
            <p className="mt-1 text-xs">Dodaj wypłatę dywidendy w sekcji Transakcje (typ: DIV) lub ręcznie powyżej.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                  <th className="text-left px-5 py-2.5">Spółka</th>
                  <th className="text-right px-5 py-2.5">Wypłaty</th>
                  <th className="text-right px-5 py-2.5">Łącznie PLN ({modeLabel})</th>
                  <th className="text-right px-5 py-2.5">YoC (prognoza)</th>
                </tr>
              </thead>
              <tbody>
                {bySymbol.map(row => {
                  const yoc = yocMap[row.symbol]?.yoc;
                  return (
                    <tr key={row.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-2.5 font-bold text-slate-100">
                        {row.symbol}
                        {row.name && row.name !== row.symbol && (
                          <span className="ml-2 text-xs text-slate-500 font-normal">{row.name}</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right text-slate-400">{row.count}×</td>
                      <td className={`px-5 py-2.5 text-right font-semibold text-yellow-400${isPrivate ? ' privacy-blur' : ''}`}>
                        {fmt(row.totalPLN)} zł
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        {yoc != null
                          ? <span className="text-emerald-400 font-medium">{fmt(yoc, 2)}%</span>
                          : <span className="text-slate-600 text-xs">{yocLoading ? '…' : '—'}</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Historia wypłat ── */}
      {dividends.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Historia wypłat</h2>
            <span className="text-xs text-slate-500">{dividends.length} wpisów</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                  <th className="text-left px-5 py-2.5">Data</th>
                  <th className="text-left px-5 py-2.5">Spółka</th>
                  <th className="text-right px-5 py-2.5">Kwota/ak. ({modeLabel})</th>
                  <th className="text-right px-5 py-2.5">Ilość</th>
                  <th className="text-right px-5 py-2.5">≈ PLN</th>
                  <th className="text-left px-5 py-2.5">Notatka</th>
                </tr>
              </thead>
              <tbody>
                {dividends.map(d => {
                  const taxRate  = getTaxRate(d.symbol, d.currency);
                  const dispPricePerShare = isNet ? d.price * (1 - taxRate) : d.price;
                  const approxPLN = dispPLN(d);
                  return (
                    <tr key={d.id ?? d.date + d.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-3 text-slate-400">{d.date}</td>
                      <td className="px-5 py-3 font-bold text-slate-100">
                        {d.symbol}
                        {d.name && d.name !== d.symbol && (
                          <span className="ml-2 text-xs text-slate-500 font-normal">{d.name}</span>
                        )}
                      </td>
                      <td className={`px-5 py-3 text-right text-yellow-400 font-semibold${isPrivate ? ' privacy-blur' : ''}`}>
                        {fmt(dispPricePerShare)} {CUR_SYMBOLS[d.currency] ?? d.currency}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">{d.qty ?? '—'}</td>
                      <td className={`px-5 py-3 text-right font-semibold text-slate-200${isPrivate ? ' privacy-blur' : ''}`}>
                        {fmt(approxPLN)} zł
                      </td>
                      <td className="px-5 py-3 text-slate-500 text-xs">{d.note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddDividendModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        initialData={editTarget}
      />
    </div>
  );
}
