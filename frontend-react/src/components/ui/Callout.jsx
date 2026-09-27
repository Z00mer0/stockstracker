import { cx } from './cx.js';

// Ramka z komunikatem w treści strony (ostrzeżenie, podpowiedź, błąd).
// Z `onClick` cała ramka jest przyciskiem — np. „przejdź do Portfela".
const TONE = {
  info: 'border-[color-mix(in_oklab,var(--info),transparent_60%)] bg-info-soft [&_svg]:text-info',
  warn: 'border-[color-mix(in_oklab,var(--warn),transparent_55%)] bg-warn-soft [&_svg]:text-warn',
  down: 'border-[color-mix(in_oklab,var(--down),transparent_55%)] bg-down-soft [&_svg]:text-down',
  up:   'border-[color-mix(in_oklab,var(--up),transparent_55%)] bg-up-soft [&_svg]:text-up',
};

export default function Callout({ tone = 'info', icon: Icon, title, children, onClick, className }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      role={tone === 'warn' || tone === 'down' ? 'alert' : undefined}
      className={cx(
        'flex w-full items-start gap-3 rounded-card-sm border px-4 py-3 text-left text-[13px] text-fg',
        onClick && 'transition hover:brightness-110',
        TONE[tone], className,
      )}
    >
      {Icon && <Icon size={17} aria-hidden className="mt-px shrink-0" />}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx('text-small text-dim', title && 'mt-0.5')}>{children}</div>}
      </div>
    </Tag>
  );
}
