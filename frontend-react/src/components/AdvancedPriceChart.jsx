// src/components/AdvancedPriceChart.jsx
import React, { useState, useEffect } from 'react';
import CandlestickChart from './CandlestickChart';
import IndicatorPanel from './IndicatorPanel';
import { usePriceHistory } from '../hooks/usePriceHistory';
import { useTechnicalIndicators } from '../hooks/useTechnicalIndicators';

const PERIODS = ['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'];

const DEFAULT_IND = {
  showMA20: true,
  showMA50: false,
  showEMA:  false,
  showBB:   false,
  showRSI:  false,
  showMACD: false,
};

export default function AdvancedPriceChart({ symbol, onClose }) {
  const [period, setPeriod]         = useState('3M');
  const [indicators, setIndicators] = useState(DEFAULT_IND);
  const [selectedCandle, setSelectedCandle] = useState(null);

  const { candles, loading, error } = usePriceHistory(symbol, period);
  const technicalData               = useTechnicalIndicators(candles);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  function downloadCSV() {
    const header = 'Data,Otwarcie,Maksimum,Minimum,Zamknięcie,Wolumen';
    const rows   = candles.map(c => `${c.date},${c.open},${c.high},${c.low},${c.close},${c.volume}`);
    const blob   = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    a.href = url; a.download = `${symbol}_${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-5xl bg-slate-800 rounded-2xl border border-slate-700 flex flex-col max-h-[92vh] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-100">{symbol}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Wykres świecowy · scroll = zoom · przeciągnij = pan</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCSV}
              disabled={!candles.length}
              className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 px-3 py-1.5 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors"
            >
              Pobierz CSV
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 text-lg"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 px-5 py-3 border-b border-slate-700 shrink-0">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setSelectedCandle(null); }}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                period === p
                  ? 'bg-indigo-500 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Indicator toggles */}
        <div className="px-5 py-3 border-b border-slate-700 shrink-0">
          <IndicatorPanel indicators={indicators} onChange={setIndicators} />
        </div>

        {/* Chart area */}
        <div className="flex-1 overflow-auto px-3 py-3 min-h-0">
          {loading && (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
          )}
          {error && (
            <div className="text-center py-16">
              <p className="text-rose-400 font-medium">Błąd ładowania danych</p>
              <p className="text-sm text-rose-300 mt-1">{error}</p>
            </div>
          )}
          {!loading && !error && candles.length > 0 && (
            <CandlestickChart
              candles={candles}
              indicators={indicators}
              technicalData={technicalData}
              onCandleClick={setSelectedCandle}
            />
          )}
          {!loading && !error && candles.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              Brak danych historycznych dla <span className="font-semibold text-slate-400">{symbol}</span>
            </div>
          )}
        </div>

        {/* Selected candle details footer */}
        {selectedCandle && (
          <div className="px-5 py-3 border-t border-slate-700 bg-slate-900/60 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-400">Szczegóły dnia: {selectedCandle.date}</p>
              <button onClick={() => setSelectedCandle(null)} className="text-slate-500 hover:text-slate-300 text-sm">✕</button>
            </div>
            <div className="flex flex-wrap gap-6">
              {[
                ['Otwarcie', selectedCandle.open, ''],
                ['Max', selectedCandle.high ?? selectedCandle.close, ''],
                ['Min', selectedCandle.low ?? selectedCandle.close, ''],
                ['Zamknięcie', selectedCandle.close, selectedCandle.close >= selectedCandle.open ? 'text-emerald-400' : 'text-rose-400'],
              ].map(([lbl, val, cls]) => (
                <div key={lbl}>
                  <span className="text-xs text-slate-500">{lbl} </span>
                  <span className={`text-sm font-semibold ${cls || 'text-slate-200'}`}>{val?.toFixed(2)}</span>
                </div>
              ))}
              {selectedCandle.volume != null && (
                <div>
                  <span className="text-xs text-slate-500">Wolumen </span>
                  <span className="text-sm font-semibold text-slate-300">
                    {(selectedCandle.volume / 1_000_000).toFixed(2)}M
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
