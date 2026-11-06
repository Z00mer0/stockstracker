import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { useLanguage, useT } from '../context/LanguageContext';
import { parseBigMoves } from '../utils/bigMovesLink.js';
import { formatPercent } from '../utils/format.js';
import TickerLogo from '../components/shared/TickerLogo';
import StockDetailModal from '../components/StockDetailModal';
import { EmptyState, PageHeader } from '../components/ui';
import { cx } from '../components/ui/cx.js';

// Strona otwierana ze zbiorczego pusha o dużych ruchach — lista spółek
// z portfela i watchlisty, które dziś rosną albo spadają ponad próg.
// Zmiany są z chwili wysłania powiadomienia (zapisane w linku).
function MoveList({ title, icon: Icon, accent, items, locale, onOpen }) {
  if (!items.length) return null;
  return (
    <div className="card min-w-0 overflow-hidden">
      <div className={cx('flex items-center gap-2 border-b border-line px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider', accent)}>
        <Icon size={14} aria-hidden /> {title} · {items.length}
      </div>
      {items.map(m => (
        <button
          key={m.symbol}
          type="button"
          onClick={() => onOpen(m.symbol)}
          className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-b-0 hover:bg-panel-hover"
        >
          <TickerLogo symbol={m.symbol} />
          <span className="min-w-0 flex-1 truncate font-semibold text-fg">{m.symbol}</span>
          <span className={cx('shrink-0 font-semibold tabular-nums', m.pct >= 0 ? 'text-up' : 'text-down')}>
            {formatPercent(m.pct, { locale })}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function BigMoves() {
  const t = useT();
  const { locale } = useLanguage();
  const { search } = useLocation();
  const { date, up, down } = parseBigMoves(search);
  const [selected, setSelected] = useState(null);
  const dateLabel = date ? new Date(`${date}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long' }) : null;

  return (
    <div>
      <PageHeader
        title={t('bm_title')}
        subtitle={[dateLabel, t('bm_subtitle').replace('{up}', up.length).replace('{down}', down.length)].filter(Boolean).join(' · ')}
      />
      {!up.length && !down.length ? (
        <EmptyState icon={Zap} title={t('bm_empty')} className="py-16" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <MoveList title={t('bm_up')} icon={TrendingUp} accent="text-up" items={up} locale={locale} onOpen={setSelected} />
          <MoveList title={t('bm_down')} icon={TrendingDown} accent="text-down" items={down} locale={locale} onOpen={setSelected} />
        </div>
      )}
      <p className="mt-3 text-small text-faint">{t('bm_note')}</p>
      {selected && <StockDetailModal item={{ symbol: selected }} onClose={() => setSelected(null)} />}
    </div>
  );
}
