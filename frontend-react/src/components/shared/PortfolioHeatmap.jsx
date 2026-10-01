import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage, useT } from '../../context/LanguageContext';
import { squarify, heatTone } from '../../utils/treemap.js';

const GAP = 2;

// Mapa portfela: pole kafelka = wartość pozycji, kolor = zmiana dnia.
// Na kafelkach tylko procenty (udział, zmiana) — kwot nie ma, więc tryb
// prywatności nie ma tu czego ukrywać.
export default function PortfolioHeatmap({ positions, onOpen, height = 300 }) {
  const t = useT();
  const { locale } = useLanguage();
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const items = useMemo(
    () => positions.filter(p => p.valuePLN > 0).sort((a, b) => b.valuePLN - a.valuePLN),
    [positions],
  );
  const total = items.reduce((s, p) => s + p.valuePLN, 0);
  const rects = useMemo(
    () => (width > 0 ? squarify(items.map(p => p.valuePLN), { x: 0, y: 0, w: width, h: height }) : []),
    [items, width, height],
  );
  const pct = (v, d = 1) => `${v > 0 ? '+' : ''}${v.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

  return (
    <div className="grid gap-2">
      <div ref={ref} className="relative w-full overflow-hidden rounded-card-sm" style={{ height }} role="list" aria-label={t('heatmap_title')}>
        {rects.map((r, i) => {
          const p = items[i];
          const { tone, strength } = heatTone(p.dailyChg);
          const share = (p.valuePLN / total) * 100;
          const bg = tone === 'none'
            ? 'var(--panel-2)'
            : `color-mix(in oklab, var(--${tone}) ${12 + strength * 0.68}%, var(--panel-2))`;
          const w = r.w - GAP, h = r.h - GAP;
          const big = w >= 64 && h >= 44;
          const small = !big && w >= 36 && h >= 22;
          const label = `${p.symbol}: ${t('heatmap_share').replace('{n}', share.toFixed(1))}, ${p.dailyChg != null ? `${t('heatmap_today')} ${pct(p.dailyChg, 2)}` : t('heatmap_no_change')}`;
          return (
            <button
              key={p.symbol}
              type="button"
              role="listitem"
              aria-label={label}
              title={label}
              onClick={() => onOpen?.(p)}
              className="absolute flex flex-col items-center justify-center overflow-hidden rounded-[6px] text-center text-fg outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent"
              style={{ left: r.x, top: r.y, width: Math.max(0, w), height: Math.max(0, h), background: bg }}
            >
              {big && (
                <>
                  <span className="max-w-full truncate px-1 font-bold" style={{ fontSize: Math.min(18, Math.max(12, Math.sqrt(w * h) / 7)) }}>{p.symbol.replace(/\.WA$/, '')}</span>
                  <span className="text-[12px] font-semibold tabular-nums">{p.dailyChg != null ? pct(p.dailyChg, 2) : '—'}</span>
                  {h >= 70 && <span className="text-[10px] tabular-nums opacity-75">{share.toFixed(1)}%</span>}
                </>
              )}
              {small && <span className="max-w-full truncate px-0.5 text-[10px] font-semibold">{p.symbol.replace(/\.WA$/, '')}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 text-[11px] text-faint" aria-hidden>
        <span>−3%</span>
        <span className="h-2 w-28 rounded-full" style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--down) 80%, var(--panel-2)), var(--panel-2), color-mix(in oklab, var(--up) 80%, var(--panel-2)))' }} />
        <span>+3%</span>
      </div>
    </div>
  );
}
