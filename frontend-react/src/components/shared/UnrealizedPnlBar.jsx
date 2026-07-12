import React from 'react';
import { BarChart, Bar, Cell, LabelList, ReferenceLine, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * Poziomy wykres słupkowy niezrealizowanego P&L per pozycja.
 * rows: [{ symbol, pl }] w walucie wyświetlania, posortowane malejąco.
 */
export default function UnrealizedPnlBar({ rows, currLabel, locale, fmt }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 8 }}>
        <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} tickLine={false} axisLine={false}
          tickFormatter={v => Number(v).toLocaleString(locale, { maximumFractionDigits: 0 })} />
        <YAxis type="category" dataKey="symbol" width={72} interval={0} tick={{ fontSize: 11, fill: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: 'var(--text-dim)', marginBottom: 4 }}
          formatter={(v) => [`${v >= 0 ? '+' : ''}${fmt(v, 2, locale)} ${currLabel}`, 'P&L']}
        />
        <ReferenceLine x={0} stroke="var(--border)" />
        <Bar dataKey="pl" radius={[0, 3, 3, 0]} maxBarSize={16}>
          {rows.map(r => (
            <Cell key={r.symbol} fill={r.pl >= 0 ? 'var(--up)' : 'var(--down)'} fillOpacity={0.8} />
          ))}
          <LabelList
            dataKey="pl"
            position="right"
            formatter={v => `${v >= 0 ? '+' : ''}${Number(v).toLocaleString(locale, { maximumFractionDigits: 0 })}`}
            style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--text-dim)' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
