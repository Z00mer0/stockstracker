import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import Spinner from '../components/shared/Spinner';
import Card from '../components/shared/Card';
import Chip from '../components/shared/Chip';
import SegmentedControl from '../components/shared/SegmentedControl';
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
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Dywidendy (12 mies.) · {modeLabel}
          </p>
          <p className={`text-2xl font-bold${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--warn)' }}>
            {fmt(annualDivPLN)} zł
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>ostatnie 12 miesięcy</p>
        </div>

        <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }} className="flex items-center gap-2">
            Yield portfela (proj.)
            {yocLoading && <Spinner size="sm" />}
          </p>
          {portfolioYield != null ? (
            <p className={`text-2xl font-bold${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--up)' }}>
              {fmt(portfolioYield, 2)}%
            </p>
          ) : (
            <p className="text-2xl font-bold" style={{ color: 'var(--text-faint)' }}>—</p>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>roczne dywidendy / wartość portfela</p>
        </div>

        <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Nadchodzące (30 dni)</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--info)' }}>{upcoming30d.length}</p>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
            {upcoming30d.length > 0
              ? upcoming30d.map(e => e.symbol).join(', ')
              : 'brak zaplanowanych'}
          </p>
        </div>
      </div>

      {/* ── Netto / Brutto toggle ── */}
      <div className="card flex items-center justify-between" style={{ padding: '12px 20px' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Tryb wyświetlania kwot</p>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
            {isNet
              ? `Po podatku: GPW 19%, US ${getUsTaxRate() === 0.30 ? '30' : '15'}% (zmień w Ustawienia)`
              : 'Kwoty brutto — przed potrąceniem podatku'}
          </p>
        </div>
        <SegmentedControl
          options={['BRUTTO', 'NETTO']}
          value={isNet ? 'NETTO' : 'BRUTTO'}
          onChange={v => { setIsNet(v === 'NETTO'); localStorage.setItem(DIV_MODE_KEY, v === 'NETTO' ? 'net' : 'gross'); }}
        />
      </div>

      {/* ── Banner + dodaj GPW ── */}
      <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--info)', lineHeight: 1.5, maxWidth: 520 }}>
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
      <Card
        title="Nadchodzące dywidendy"
        actions={
          <>
            {divLoading && <Spinner size="sm" />}
            <button
              onClick={() => { setEditTarget(null); setModalOpen(true); }}
              className="text-xs px-2.5 py-1 rounded-md bg-indigo-700 hover:bg-indigo-600 text-white transition-colors"
            >+ Dodaj ręcznie</button>
          </>
        }
      >
        {divLoading && !upcoming.length ? (
          <div className="flex justify-center py-8"><Spinner size="md" /></div>
        ) : upcoming.length === 0 ? (
          <div className="card-body text-center" style={{ color: 'var(--text-faint)', fontSize: 13 }}>
            Brak nadchodzących dywidend.
            {symbols.some(s => !s.includes('.')) && (
              <span className="block mt-1" style={{ fontSize: 11 }}>US stocks: Finnhub może nie mieć danych dla tej spółki.</span>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Spółka</th>
                  <th>Ex-date</th>
                  <th>Pay-date</th>
                  <th className="right">Kwota/ak. ({modeLabel})</th>
                  <th>Źródło</th>
                  <th />
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
                    <tr key={ev.id ?? i}>
                      <td className="font-bold" style={{ color: 'var(--text)' }}>💰 {ev.symbol}</td>
                      <td style={{ color: 'var(--text)' }}>{ev.date}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{ev.payDate ?? '—'}</td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--warn)', fontWeight: 600 }}>
                        {dispAmount != null ? `${fmt(dispAmount)} ${cur}` : '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                        {ev.isManual ? '✍️ ręczne' : '🤖 auto'}
                      </td>
                      <td className="right">
                        {ev.isManual && (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => { const src = manualDividends.find(d => d.id === ev.id); if (src) openEdit(src); }}
                              style={{ fontSize: 11, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer' }}
                            >Edytuj</button>
                            <button
                              onClick={() => deleteDividend(ev.id)}
                              style={{ fontSize: 11, color: 'var(--down)', background: 'none', border: 'none', cursor: 'pointer' }}
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
      </Card>

      {/* ── Timeline wypłat ── */}
      {timeline.length > 0 && (
        <Card title="Timeline wypłat">
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {timeline.map(({ ym, items, totalPLN: monthTotal }) => (
              <div key={ym} style={{ borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '8px 20px', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {fmtMonthYear(ym)}
                  </span>
                  <span className={`mono${isPrivate ? ' privacy-blur' : ''}`} style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn)' }}>
                    {fmt(monthTotal)} zł {modeLabel}
                  </span>
                </div>
                {items.map(d => (
                  <div key={d.id ?? d.date + d.symbol} style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-bold shrink-0" style={{ fontSize: 13, color: 'var(--text)' }}>{d.symbol}</span>
                      {d.name && d.name !== d.symbol && (
                        <span className="truncate" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.name}</span>
                      )}
                      <span className="shrink-0" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.date}</span>
                    </div>
                    <span className={`mono shrink-0 ml-4${isPrivate ? ' privacy-blur' : ''}`} style={{ fontSize: 13, fontWeight: 600, color: 'var(--warn)' }}>
                      {fmt(d.dispPLN)} zł
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── KPI summary ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Łącznie dywidendy ({modeLabel})</p>
          <p className={`text-2xl font-bold${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--warn)' }}>{fmt(totalPLN)} zł</p>
        </div>
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Liczba wypłat</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{dividends.length}</p>
        </div>
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Spółki dywidendowe</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{bySymbol.length}</p>
        </div>
      </div>

      {/* ── Per spółka + YoC ── */}
      <Card
        title="Dywidendy per spółka · Yield on Cost"
        actions={yocLoading && <Spinner size="sm" />}
      >
        {bySymbol.length === 0 ? (
          <div className="card-body text-center">
            <div className="text-4xl mb-3">🌱</div>
            <p className="font-semibold" style={{ color: 'var(--text-dim)' }}>Brak spółek dywidendowych w portfelu</p>
            <p style={{ marginTop: 4, fontSize: 11, color: 'var(--text-faint)' }}>Dodaj wypłatę dywidendy w sekcji Transakcje (typ: DIV) lub ręcznie powyżej.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Spółka</th>
                  <th className="right">Wypłaty</th>
                  <th className="right">Łącznie PLN ({modeLabel})</th>
                  <th className="right">YoC (prognoza)</th>
                </tr>
              </thead>
              <tbody>
                {bySymbol.map(row => {
                  const yoc = yocMap[row.symbol]?.yoc;
                  return (
                    <tr key={row.symbol}>
                      <td className="font-bold" style={{ color: 'var(--text)' }}>
                        {row.symbol}
                        {row.name && row.name !== row.symbol && (
                          <span className="ml-2 font-normal" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{row.name}</span>
                        )}
                      </td>
                      <td className="right" style={{ color: 'var(--text-dim)' }}>{row.count}×</td>
                      <td className={`right mono font-semibold${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--warn)' }}>
                        {fmt(row.totalPLN)} zł
                      </td>
                      <td className="right">
                        {yoc != null
                          ? <Chip value={yoc} />
                          : <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>{yocLoading ? '…' : '—'}</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Historia wypłat ── */}
      {dividends.length > 0 && (
        <Card
          title="Historia wypłat"
          actions={<span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{dividends.length} wpisów</span>}
        >
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Spółka</th>
                  <th className="right">Kwota/ak. ({modeLabel})</th>
                  <th className="right">Ilość</th>
                  <th className="right">≈ PLN</th>
                  <th>Notatka</th>
                </tr>
              </thead>
              <tbody>
                {dividends.map(d => {
                  const taxRate  = getTaxRate(d.symbol, d.currency);
                  const dispPricePerShare = isNet ? d.price * (1 - taxRate) : d.price;
                  const approxPLN = dispPLN(d);
                  return (
                    <tr key={d.id ?? d.date + d.symbol}>
                      <td style={{ color: 'var(--text-dim)' }}>{d.date}</td>
                      <td className="font-bold" style={{ color: 'var(--text)' }}>
                        {d.symbol}
                        {d.name && d.name !== d.symbol && (
                          <span className="ml-2 font-normal" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.name}</span>
                        )}
                      </td>
                      <td className={`right mono font-semibold${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--warn)' }}>
                        {fmt(dispPricePerShare)} {CUR_SYMBOLS[d.currency] ?? d.currency}
                      </td>
                      <td className="right mono" style={{ color: 'var(--text-dim)' }}>{d.qty ?? '—'}</td>
                      <td className={`right mono font-semibold${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--text)' }}>
                        {fmt(approxPLN)} zł
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
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
