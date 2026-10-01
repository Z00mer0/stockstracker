// src/components/IndicatorPanel.jsx
import { cx } from './ui/cx.js';

// Kolory serii wspólne dla przycisków i wykresu (wcześniej osobne kopie).
export const INDICATOR_COLORS = {
  ma20: '#eab308', ma50: '#f97316', ema: '#3b82f6', bb: '#6366f1', rsi: '#a855f7', macd: '#3b82f6', signal: '#f97316',
};

const ITEMS = [
  { key: 'showMA20', label: 'MA 20',     color: INDICATOR_COLORS.ma20 },
  { key: 'showMA50', label: 'MA 50',     color: INDICATOR_COLORS.ma50 },
  { key: 'showEMA',  label: 'EMA 21',    color: INDICATOR_COLORS.ema },
  { key: 'showBB',   label: 'Bollinger', color: INDICATOR_COLORS.bb },
  { key: 'showRSI',  label: 'RSI',       color: INDICATOR_COLORS.rsi },
  { key: 'showMACD', label: 'MACD',      color: INDICATOR_COLORS.macd },
];

export default function IndicatorPanel({ indicators, onChange, label }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {ITEMS.map(({ key, label: text, color }) => {
        const active = indicators[key];
        return (
          <button
            key={key}
            type="button"
            aria-pressed={!!active}
            onClick={() => onChange(prev => ({ ...prev, [key]: !prev[key] }))}
            className={cx(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition',
              active ? 'border-line-strong bg-panel-hover text-fg' : 'border-line text-dim hover:border-line-strong hover:text-fg',
            )}
          >
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color, opacity: active ? 1 : 0.5 }} />
            {text}
          </button>
        );
      })}
    </div>
  );
}
