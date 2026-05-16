import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import Spinner from '../components/shared/Spinner';
import AddDividendModal from '../components/AddDividendModal';
import useDividendEvents from '../hooks/useDividendEvents';

const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function Dividends() {
  const { transactions, loading, fxRates, portfolio } = useApp();
  const { isPrivate } = usePrivacy();
  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);

  const {
    manualDividends, autoEvents, allCalendarEvents,
    loading: divLoading, addDividend, editDividend, deleteDividend,
  } = useDividendEvents(symbols);

  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  // Nadchodzące dywidendy (ex-date >= dziś)
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = useMemo(() =>
    allCalendarEvents.filter(e => e.date >= today),
    [allCalendarEvents, today]
  );

  // Historia wypłat (transakcje typu DIV)
  const dividends = useMemo(() =>
    [...transactions.filter(t => t.type === 'DIV')]
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions]
  );

  const totalPLN = useMemo(() =>
    dividends.reduce((sum, d) =>
      sum + (d.price || 0) * (d.qty || 1) * (fxRates[d.currency] ?? 1), 0),
    [dividends, fxRates]
  );

  const bySymbol = useMemo(() => {
    const map = {};
    dividends.forEach(d => {
      const key = d.symbol ?? 'INNE';
      if (!map[key]) map[key] = { symbol: key, name: d.name, totalPLN: 0, count: 0 };
      map[key].totalPLN += (d.price || 0) * (d.qty || 1) * (fxRates[d.currency] ?? 1);
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.totalPLN - a.totalPLN);
  }, [dividends, fxRates]);

  function openEdit(div) {
    setEditTarget(div);
    setModalOpen(true);
  }

  function handleSave(formData) {
    if (editTarget) {
      editDividend(editTarget.id, formData);
    } else {
      addDividend(formData);
    }
    setEditTarget(null);
  }

  function handleCloseModal() {
    setModalOpen(false);
    setEditTarget(null);
  }

  if (loading && !transactions.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Baner informacyjny */}
      <div className="rounded-xl border border-blue-800/50 bg-blue-950/30 px-5 py-4 flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-blue-300 leading-relaxed max-w-lg">
          <span className="font-semibold">ℹ️ Daty dywidend GPW</span> (XTB.WA, VOT.WA itp.) są dodawane ręcznie — brak darmowego API dla GPW.
          Daty dla spółek US (NVDA, HOOD itp.) są pobierane automatycznie z Finnhub.
        </p>
        <button
          onClick={() => { setEditTarget(null); setModalOpen(true); }}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          + Dodaj dywidendę GPW
        </button>
      </div>

      {/* Nadchodzące dywidendy */}
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
                  <th className="text-right px-5 py-2.5">Kwota</th>
                  <th className="text-left px-5 py-2.5">Źródło</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {upcoming.map((ev, i) => {
                  const cur = CUR_SYMBOLS[ev.currency] ?? ev.currency ?? '';
                  return (
                    <tr key={ev.id ?? i} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-3 font-bold text-slate-100">💰 {ev.symbol}</td>
                      <td className="px-5 py-3 text-slate-300">{ev.date}</td>
                      <td className="px-5 py-3 text-slate-400">{ev.payDate ?? '—'}</td>
                      <td className={`px-5 py-3 text-right text-yellow-400 font-semibold${isPrivate ? ' privacy-blur' : ''}`}>
                        {ev.amount != null ? `${fmt(ev.amount)} ${cur}` : '—'}
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

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-yellow-800/50 bg-yellow-950/30 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Łącznie dywidendy</p>
          <p className={`text-2xl font-bold text-yellow-400${isPrivate ? ' privacy-blur' : ''}`}>{fmt(totalPLN)} zł</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Liczba wypłat</p>
          <p className="text-2xl font-bold">{dividends.length}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Spółki dywidendowe</p>
          <p className="text-2xl font-bold">{bySymbol.length}</p>
        </div>
      </div>

      {/* Per spółka */}
      {bySymbol.length > 1 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300">Dywidendy per spółka</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                  <th className="text-left px-5 py-2.5">Spółka</th>
                  <th className="text-right px-5 py-2.5">Liczba</th>
                  <th className="text-right px-5 py-2.5">Łącznie PLN</th>
                </tr>
              </thead>
              <tbody>
                {bySymbol.map(row => (
                  <tr key={row.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-2.5 font-bold text-slate-100">
                      {row.symbol}
                      {row.name && row.name !== row.symbol && (
                        <span className="ml-2 text-xs text-slate-500 font-normal">{row.name}</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-400">{row.count}×</td>
                    <td className={`px-5 py-2.5 text-right font-semibold text-yellow-400${isPrivate ? ' privacy-blur' : ''}`}>{fmt(row.totalPLN)} zł</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historia wypłat */}
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
                  <th className="text-right px-5 py-2.5">Kwota/akcja</th>
                  <th className="text-right px-5 py-2.5">Ilość</th>
                  <th className="text-right px-5 py-2.5">≈ PLN</th>
                  <th className="text-left px-5 py-2.5">Notatka</th>
                </tr>
              </thead>
              <tbody>
                {dividends.map(d => {
                  const approxPLN = (d.price || 0) * (d.qty || 1) * (fxRates[d.currency] ?? 1);
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
                        {fmt(d.price)} {CUR_SYMBOLS[d.currency] ?? d.currency}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">{d.qty ?? '—'}</td>
                      <td className={`px-5 py-3 text-right font-semibold text-slate-200${isPrivate ? ' privacy-blur' : ''}`}>{fmt(approxPLN)} zł</td>
                      <td className="px-5 py-3 text-slate-500 text-xs">{d.note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      <AddDividendModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        initialData={editTarget}
      />
    </div>
  );
}
