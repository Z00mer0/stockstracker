import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import Card from '../components/shared/Card';
import TickerLogo from '../components/shared/TickerLogo';
import Spinner from '../components/shared/Spinner';
import { computeRealizedTrades, groupBySymbol, exportPIT38CSV } from '../utils/realizedPL';
import { loadJournal } from '../services/journalService';

const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };

function fmt(n, dec = 2, locale = 'pl-PL') {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function PLBadge({ value, locale, suffix = '' }) {
  const color = value > 0 ? 'var(--up)' : value < 0 ? 'var(--down)' : 'var(--text-faint)';
  const sign  = value > 0 ? '+' : '';
  return (
    <span style={{ color, fontWeight: 600 }}>
      {sign}{fmt(value, 2, locale)}{suffix}
    </span>
  );
}

export default function ClosedPositions() {
  const { transactions = [], loading, fxRates, displayCurrency } = useApp();
  const { locale } = useLanguage();
  const t = useT();

  const [view, setView]   = useState('symbol'); // 'symbol' | 'trade'
  const [filter, setFilter] = useState('');

  const trades = useMemo(() => computeRealizedTrades(transactions, fxRates), [transactions, fxRates]);
  const grouped = useMemo(() => groupBySymbol(trades), [trades]);

  const [journal, setJournal] = useState(null);
  useEffect(() => {
    loadJournal().then(setJournal).catch(() => setJournal({ theses: {}, retros: {} }));
  }, []);

  // Skuteczność decyzji z tezą vs bez tezy (impulsywnych), per rok
  const journalStats = useMemo(() => {
    if (!journal || !trades.length) return null;
    const retros = journal.retros || {};
    const verdictCounts = { hit: 0, partial: 0, miss: 0 };
    Object.values(retros).forEach(r => { if (r.verdict in verdictCounts) verdictCounts[r.verdict]++; });
    const byYear = {};
    for (const tr of trades) {
      const y = tr.date?.slice(0, 4) || '—';
      if (!byYear[y]) byYear[y] = { year: y, thesis: { n: 0, pctSum: 0 }, impulse: { n: 0, pctSum: 0 } };
      const g = retros[tr.id]?.hadThesis ? byYear[y].thesis : byYear[y].impulse;
      g.n++; g.pctSum += tr.pct;
    }
    const years = Object.values(byYear).sort((a, b) => b.year.localeCompare(a.year));
    return { years, verdictCounts, hasThesisData: years.some(y => y.thesis.n > 0) };
  }, [journal, trades]);

  const currSym = CUR_SYMBOLS[displayCurrency] ?? displayCurrency;
  const rate = fxRates[displayCurrency] ?? 1;

  // Summary KPIs
  const totalGainPLN = trades.filter(t => t.plPLN > 0).reduce((s, t) => s + t.plPLN, 0);
  const totalLossPLN = trades.filter(t => t.plPLN < 0).reduce((s, t) => s + t.plPLN, 0);
  const netPLN       = totalGainPLN + totalLossPLN;

  // Convert PLN → display currency
  const toDisp = pln => (displayCurrency === 'PLN' ? pln : pln / rate);

  const filteredTrades  = filter ? trades.filter(t  => t.symbol.toUpperCase().includes(filter.toUpperCase())) : trades;
  const filteredGrouped = filter ? grouped.filter(g => g.symbol.toUpperCase().includes(filter.toUpperCase())) : grouped;

  function downloadCSV() {
    const csv  = exportPIT38CSV(trades, fxRates, locale);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `pit38_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4" style={{ padding: '0 0 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('closed_positions_title')}</h1>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '2px 0 0' }}>{t('closed_positions_subtitle')}</p>
        </div>
        <button
          onClick={downloadCSV}
          className="btn btn-primary"
          style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          disabled={trades.length === 0}
        >
          ↓ {t('export_pit38')}
        </button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[
          { label: t('realized_gain'),   value: toDisp(totalGainPLN),  color: 'var(--up)' },
          { label: t('realized_loss'),   value: toDisp(totalLossPLN),  color: 'var(--down)' },
          { label: t('net_realized_pl'), value: toDisp(netPLN),        color: netPLN >= 0 ? 'var(--up)' : 'var(--down)' },
          { label: t('closed_trades_count'), value: null, count: trades.length },
        ].map((k, i) => (
          <div key={i} className="card" style={{ padding: '14px 16px' }}>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{k.label}</p>
            {k.count != null
              ? <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{k.count}</p>
              : <p style={{ fontSize: 22, fontWeight: 700, color: k.color, margin: 0 }}>
                  {k.value >= 0 && k.color !== 'var(--down)' ? '+' : ''}{fmt(k.value, 2, locale)} {currSym}
                </p>
            }
          </div>
        ))}
      </div>

      {trades.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>
          <p style={{ fontSize: 14 }}>{t('no_closed_positions')}</p>
        </div>
      )}

      {/* Dziennik inwestora — skuteczność tez */}
      {journalStats && (
        <Card title={`📓 ${t('journal_stats_title')}`} collapsible collapseKey="cp_journal">
          <div className="card-body">
            {journalStats.hasThesisData ? (
              <>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14, fontSize: 12, color: 'var(--text-dim)' }}>
                  <span>✅ {t('journal_hit')}: <b style={{ color: 'var(--up)' }}>{journalStats.verdictCounts.hit}</b></span>
                  <span>➖ {t('journal_partial')}: <b style={{ color: 'var(--warn)' }}>{journalStats.verdictCounts.partial}</b></span>
                  <span>❌ {t('journal_miss')}: <b style={{ color: 'var(--down)' }}>{journalStats.verdictCounts.miss}</b></span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {[t('journal_year_col'), t('journal_with_thesis'), t('journal_without_thesis')].map((h, i) => (
                          <th key={h} style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {journalStats.years.map(y => {
                        const cell = (g) => g.n === 0
                          ? <span style={{ color: 'var(--text-faint)' }}>—</span>
                          : (() => {
                              const avg = g.pctSum / g.n;
                              return (
                                <>
                                  <span style={{ color: avg >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
                                    {avg >= 0 ? '+' : ''}{fmt(avg, 1, locale)}%
                                  </span>
                                  <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> ({g.n} {t('journal_trades_unit')})</span>
                                </>
                              );
                            })();
                        return (
                          <tr key={y.year} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 10px', color: 'var(--text)', fontWeight: 600 }}>{y.year}</td>
                            <td className="mono" style={{ padding: '8px 10px', textAlign: 'right' }}>{cell(y.thesis)}</td>
                            <td className="mono" style={{ padding: '8px 10px', textAlign: 'right' }}>{cell(y.impulse)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10 }}>{t('journal_stats_note')}</p>
              </>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('journal_stats_empty')}</p>
            )}
          </div>
        </Card>
      )}

      {trades.length > 0 && (
        <Card
          title={t('closed_positions_title')}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Symbol…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="field-input"
                style={{ width: 100, fontSize: 12, padding: '4px 8px' }}
              />
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                {['symbol', 'trade'].map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    style={{
                      padding: '4px 10px', fontSize: 11, border: 'none', cursor: 'pointer',
                      background: view === v ? 'var(--accent)' : 'transparent',
                      color: view === v ? '#051a10' : 'var(--text-dim)',
                      fontWeight: view === v ? 700 : 400,
                    }}
                  >
                    {v === 'symbol' ? t('group_by_symbol') : t('by_trade')}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {view === 'symbol'
                    ? ['Symbol', t('trades_count'), t('total_qty'), t('avg_cost'), t('avg_sell'), `P&L (${currSym})`, 'P&L %'].map((h, i) => (
                        <th key={i} style={{ padding: '8px 12px', textAlign: i >= 2 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))
                    : ['Symbol', t('col_date'), t('qty_short'), t('avg_cost'), t('col_price'), `P&L (${currSym})`, 'P&L %'].map((h, i) => (
                        <th key={i} style={{ padding: '8px 12px', textAlign: i >= 2 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))
                  }
                </tr>
              </thead>
              <tbody>
                {view === 'symbol'
                  ? filteredGrouped.map(g => {
                      const avgSell = g.trades.reduce((s, t) => s + t.sellPrice * t.qty, 0) / g.totalQty;
                      const avgCost = g.trades.reduce((s, t) => s + t.costBasis * t.qty, 0) / g.totalQty;
                      const plDisp  = toDisp(g.plPLN);
                      const avgPct  = g.trades.reduce((s, t) => s + t.pct, 0) / g.trades.length;
                      return (
                        <tr key={g.symbol} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <TickerLogo symbol={g.symbol} size={24} />
                              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{g.symbol}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-dim)', textAlign: 'right' }}>{g.trades.length}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(g.totalQty, g.totalQty % 1 === 0 ? 0 : 4, locale)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-dim)' }}>{fmt(avgCost, 2, locale)} <span style={{ fontSize: 11 }}>{CUR_SYMBOLS[g.currency] ?? g.currency}</span></td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(avgSell, 2, locale)} <span style={{ fontSize: 11 }}>{CUR_SYMBOLS[g.currency] ?? g.currency}</span></td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}><PLBadge value={plDisp} locale={locale} /></td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}><PLBadge value={avgPct} locale={locale} suffix="%" /></td>
                        </tr>
                      );
                    })
                  : filteredTrades.map(tr => {
                      const plDisp = toDisp(tr.plPLN);
                      return (
                        <tr key={tr.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <TickerLogo symbol={tr.symbol} size={24} />
                              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{tr.symbol}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-dim)', fontSize: 12 }}>{tr.date}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(tr.qty, tr.qty % 1 === 0 ? 0 : 4, locale)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-dim)' }}>{fmt(tr.costBasis, 2, locale)} <span style={{ fontSize: 11 }}>{CUR_SYMBOLS[tr.currency] ?? tr.currency}</span></td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(tr.sellPrice, 2, locale)} <span style={{ fontSize: 11 }}>{CUR_SYMBOLS[tr.currency] ?? tr.currency}</span></td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}><PLBadge value={plDisp} locale={locale} /></td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}><PLBadge value={tr.pct} locale={locale} suffix="%" /></td>
                        </tr>
                      );
                    })
                }
              </tbody>
            </table>
          </div>

          {/* PIT-38 note */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)' }}>
            {t('pit38_note')}
          </div>
        </Card>
      )}
    </div>
  );
}
