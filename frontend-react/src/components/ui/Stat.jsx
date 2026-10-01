import { cx } from './cx.js';
import Badge from './Badge.jsx';

// Kafelek z liczbą: etykieta, wartość, zmiana, podpis. Klikalny, gdy ma
// onClick (wtedy to <button> — dostępny z klawiatury).
//   hero      — wyróżniony kafelek (delikatny gradient akcentu)
//   spark     — mały wykres obok wartości; na telefonie ukryty, bo w
//               kafelku szerokim na 170 px zasłaniał podpis
//   blur      — tryb prywatności: rozmywa kwotę i zmianę
//   hintTone  — 'warn' dla podpisów-ostrzeżeń (np. nieaktualny kurs walut)
export default function Stat({
  label, value, delta, deltaTone = 'neutral', hint, hintTone, icon: Icon,
  tone, spark, hero = false, blur = false, onClick, className,
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'flex min-w-0 flex-col gap-2 rounded-card border p-4 text-left shadow-card',
        hero
          ? 'border-[color-mix(in_oklab,var(--accent),transparent_65%)] bg-[linear-gradient(160deg,color-mix(in_oklab,var(--accent),transparent_90%),var(--panel)_60%)]'
          : 'border-line bg-panel',
        onClick && 'transition hover:border-line-strong hover:brightness-[1.04]',
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
      <div className="flex items-end justify-between gap-3">
        <div className={cx('min-w-0 truncate text-[21px] font-semibold leading-tight tracking-tight sm:text-kpi', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-fg', blur && 'privacy-blur')}>
          {value}
        </div>
        {spark && <div className="mb-1 hidden shrink-0 sm:block">{spark}</div>}
      </div>
      {(delta != null || hint) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-dim">
          {delta != null && <Badge tone={deltaTone} className={blur ? 'privacy-blur' : undefined}>{delta}</Badge>}
          {hint && <span className={cx('min-w-0', hintTone === 'warn' && 'text-warn')}>{hint}</span>}
        </div>
      )}
    </Tag>
  );
}
