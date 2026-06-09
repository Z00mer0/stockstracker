import React from 'react';
import TickerLogo from './TickerLogo';
import { useT } from '../../context/LanguageContext';

function getPlPct(p) {
  if (p.plPLN == null || !p.costPLN) return null;
  return (p.plPLN / p.costPLN) * 100;
}

export default function WinnersLosers({ positions = [] }) {
  const t = useT();
  const withPl = positions
    .map(p => ({ ...p, _plPct: getPlPct(p) }))
    .filter(p => p._plPct != null);

  if (withPl.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 0' }}>{t('no_pl_data')}</p>;
  }

  const sorted = [...withPl].sort((a, b) => b._plPct - a._plPct);
  const top    = sorted.slice(0, 4);
  const bottom = sorted.slice(-3).filter(p => p._plPct < 0);
  const display = [...top, ...bottom];

  const max = Math.max(...display.map(p => Math.abs(p._plPct)));

  return (
    <div className="wl-list">
      {display.map(p => {
        const up = p._plPct >= 0;
        const w = max > 0 ? (Math.abs(p._plPct) / max) * 50 : 0;
        return (
          <div className="wl-row" key={p.symbol ?? p.id}>
            <div className="wl-sym">
              <TickerLogo symbol={p.symbol} size={24} />
              {p.symbol?.replace('.WA', '')}
            </div>
            <div className="wl-track">
              <div className="mid" />
              <div
                className={'wl-fill ' + (up ? 'up' : 'down')}
                style={{ width: w + '%' }}
              />
            </div>
            <div
              className="wl-pct"
              style={{ color: up ? 'var(--up)' : 'var(--down)' }}
            >
              {(p._plPct >= 0 ? '+' : '') + p._plPct.toFixed(1)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
