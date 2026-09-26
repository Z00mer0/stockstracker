import { cx } from './cx.js';
import Badge from './Badge.jsx';

// Kafelek z liczbą: etykieta, wartość, zmiana, podpis. Klikalny, gdy ma
// onClick (wtedy to <button> — dostępny z klawiatury).
export default function Stat({ label, value, delta, deltaTone = 'neutral', hint, icon: Icon, tone, onClick, className }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'flex min-w-0 flex-col gap-2 rounded-card border border-line bg-panel p-4 text-left shadow-card',
        onClick && 'transition hover:border-line-strong hover:bg-panel-hover',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-label font-semibold uppercase text-faint">{label}</span>
        {Icon && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-card-sm border border-line bg-panel-2 text-dim">
            <Icon size={14} aria-hidden />
          </span>
        )}
      </div>
      <div className={cx('truncate text-kpi', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-fg')}>
        {value}
      </div>
      {(delta != null || hint) && (
        <div className="flex flex-wrap items-center gap-2 text-small text-dim">
          {delta != null && <Badge tone={deltaTone}>{delta}</Badge>}
          {hint}
        </div>
      )}
    </Tag>
  );
}
