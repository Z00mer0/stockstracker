// src/components/IndicatorPanel.jsx
import React from 'react';

const ITEMS = [
  { key: 'showMA20', label: 'MA 20',     color: '#eab308' },
  { key: 'showMA50', label: 'MA 50',     color: '#f97316' },
  { key: 'showEMA',  label: 'EMA 21',    color: '#3b82f6' },
  { key: 'showBB',   label: 'Bollinger', color: '#6366f1' },
  { key: 'showRSI',  label: 'RSI',       color: '#a855f7' },
  { key: 'showMACD', label: 'MACD',      color: '#10b981' },
];

export default function IndicatorPanel({ indicators, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ITEMS.map(({ key, label, color }) => {
        const active = indicators[key];
        return (
          <button
            key={key}
            onClick={() => onChange(prev => ({ ...prev, [key]: !prev[key] }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              active
                ? 'border-transparent text-white'
                : 'border-slate-600 text-slate-400 bg-transparent hover:border-slate-500'
            }`}
            style={active ? { backgroundColor: color } : {}}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
