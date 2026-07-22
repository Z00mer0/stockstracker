import React from 'react';
import { BarChart, Bar, Cell, LabelList, ReferenceLine, XAxis, YAxis, ResponsiveContainer } from 'recharts';

/**
 * Poziomy wykres słupkowy niezrealizowanego P&L per pozycja.
 * rows: [{ symbol, pl }] w walucie wyświetlania, posortowane malejąco.
 * onSymbolClick(symbol) — klik na słupku (na mobile tooltip zasłaniał wykres).
 */
export default function UnrealizedPnlBar({ rows, currLabel, locale, fmt, onSymbolClick }) {
  const clickable = typeof onSymbolClick === 'function';
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 8 }}>
        <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} tickLine={false} axisLine={false}
          tickFormatter={v => Number(v).toLocaleString(locale, { maximumFractionDigits: 0 })} />
        <YAxis
          type="category"
          dataKey="symbol"
          width={72}
          interval={0}
          tick={{ fontSize: 11, fill: 'var(--text-dim)', fontFamily: 'var(--font-mono)', cursor: clickable ? 'pointer' : 'default' }}
          tickLine={false}
          axisLine={false}
          onClick={clickable ? (e) => e?.value && onSymbolClick(e.value) : undefined}
        />
        <ReferenceLine x={0} stroke="var(--border)" />
        <Bar
          dataKey="pl"
          radius={[0, 3, 3, 0]}
          maxBarSize={16}
          onClick={clickable ? (data) => data?.symbol && onSymbolClick(data.symbol) : undefined}
          style={clickable ? { cursor: 'pointer' } : undefined}
        >
          {rows.map(r => (
            <Cell key={r.symbol} fill={r.pl >= 0 ? 'var(--up)' : 'var(--down)'} fillOpacity={0.8} />
          ))}
          <LabelList
            dataKey="pl"
            position="right"
            formatter={v => `${v >= 0 ? '+' : ''}${Number(v).toLocaleString(locale, { maximumFractionDigits: 0 })}`}
            style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', fill: 'var(--text)' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
