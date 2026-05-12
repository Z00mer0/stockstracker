import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useChart } from '../context/ChartContext';
import Sparkline from '../components/shared/Sparkline';
import Spinner from '../components/shared/Spinner';

function toPlnRate(currency, fx) {
  return fx[currency] ?? 1;
}

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function KpiCard({ label, value, sub, trend, color = 'slate' }) {
  const colors = {
    slate:   'border-slate-700 bg-slate-800',
    indigo:  'border-indigo-800/60 bg-indigo-950/40',
    green:   'border-emerald-800/60 bg-emerald-950/40',
    red:     'border-rose-800/60 bg-rose-950/40',
    yellow:  'border-yellow-800/60 bg-yellow-950/40',
  };
  const trendColor = trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-rose-400' : 'text-slate-400';

  return (
    <div className={`rounded-xl border px-5 py-4 ${colors[color]}`}>
      <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
      {sub != null && (
        <p className={`text-sm mt-1 font-medium ${trendColor}`}>{sub}</p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { portfolio, transactions, snapshots, loading, fxRates } = useApp();
  const { openChart } = useChart();

  const kpi = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];

    const totalValue    = latest?.total    ?? 0;
    const totalInvested = latest?.invested ?? 0;
    const unrealPLN     = totalValue - totalInvested;
    const unrealPct     = totalInvested > 0 ? (unrealPLN / totalInvested) * 100 : 0;

    const realizedPLN = transactions
      .filter(t => t.type === 'SELL')
      .reduce((sum, tx) => {
        const rate     = toPlnRate(tx.currency, fxRates);
        const costBasis = tx.costBasis ?? tx.avgPrice ?? tx.price;
        return sum + (tx.price - costBasis) * tx.qty * rate;
      }, 0);

    const dividendsPLN = transactions
      .filter(t => t.type === 'DIV')
      .reduce((sum, d) => sum + (d.price || 0) * (d.qty || 1) * toPlnRate(d.currency, fxRates), 0);

    const sparkValues = sorted.slice(-60).map(s => s.total ?? 0);

    return { totalValue, totalInvested, unrealPLN, unrealPct, realizedPLN, dividendsPLN, sparkValues };
  }, [snapshots, transactions, fxRates]);

  const topPositions = useMemo(
    () => [...portfolio]
      .sort((a, b) => (b.qty * b.avgPrice * toPlnRate(b.currency, fxRates)) - (a.qty * a.avgPrice * toPlnRate(a.currency, fxRates)))
      .slice(0, 7),
    [portfolio, fxRates]
  );

  if (loading && !portfolio.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Wartość portfela"
          value={`${fmt(kpi.totalValue)} zł`}
          color="indigo"
        />
        <KpiCard
          label="Unrealized P&L"
          value={`${kpi.unrealPLN >= 0 ? '+' : ''}${fmt(kpi.unrealPLN)} zł`}
          sub={`${kpi.unrealPct >= 0 ? '+' : ''}${fmt(kpi.unrealPct)}%`}
          trend={kpi.unrealPLN}
          color={kpi.unrealPLN >= 0 ? 'green' : 'red'}
        />
        <KpiCard
          label="Realized P&L"
          value={`${kpi.realizedPLN >= 0 ? '+' : ''}${fmt(kpi.realizedPLN)} zł`}
          trend={kpi.realizedPLN}
          color={kpi.realizedPLN >= 0 ? 'green' : 'red'}
        />
        <KpiCard
          label="Dywidendy"
          value={`${fmt(kpi.dividendsPLN)} zł`}
          color="yellow"
        />
      </div>

      {/* Sparkline historii */}
      {kpi.sparkValues.length > 1 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-300">Historia wartości portfela</p>
            <span className="text-xs text-slate-500">{kpi.sparkValues.length} punktów</span>
          </div>
          <Sparkline data={kpi.sparkValues} width={800} height={80} />
        </div>
      )}

      {/* Top pozycje */}
      {topPositions.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300">Największe pozycje (wg kosztu)</h2>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                <th className="text-left px-5 py-2.5">Symbol</th>
                <th className="text-right px-5 py-2.5">Ilość</th>
                <th className="text-right px-5 py-2.5">Śr. cena</th>
                <th className="text-right px-5 py-2.5">Koszt (PLN)</th>
              </tr>
            </thead>
            <tbody>
              {topPositions.map((pos) => {
                const costPLN = pos.qty * pos.avgPrice * toPlnRate(pos.currency, fxRates);
                return (
                  <tr key={pos.id ?? pos.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                    <td
                      className="px-5 py-3 font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
                      onClick={() => openChart(pos.symbol)}
                      title={`Otwórz wykres ${pos.symbol}`}
                    >
                      {pos.symbol}
                      {pos.name && pos.name !== pos.symbol && (
                        <span className="ml-2 text-xs text-slate-500 font-normal">{pos.name}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-300">{fmt(pos.qty, pos.qty % 1 === 0 ? 0 : 4)}</td>
                    <td className="px-5 py-3 text-right text-slate-400">{fmt(pos.avgPrice)} {pos.currency}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-200">{fmt(costPLN)} zł</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {!portfolio.length && !loading && (
        <div className="text-center py-16 text-slate-500">
          <div className="text-5xl mb-3">📊</div>
          <p className="text-slate-400 font-semibold">Brak danych portfela</p>
          <p className="text-sm mt-1">Dodaj pozycje w głównym portalu StocksTracker</p>
        </div>
      )}
    </div>
  );
}
