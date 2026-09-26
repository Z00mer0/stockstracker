import { cx } from './cx.js';

const TONE = {
  neutral: 'bg-panel-2 text-dim border-line',
  up:      'bg-up-soft text-up border-transparent',
  down:    'bg-down-soft text-down border-transparent',
  warn:    'bg-warn-soft text-warn border-transparent',
  info:    'bg-info-soft text-info border-transparent',
};

export default function Badge({ tone = 'neutral', icon: Icon, className, children }) {
  return (
    <span className={cx(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold',
      TONE[tone], className,
    )}>
      {Icon && <Icon size={12} aria-hidden />}
      {children}
    </span>
  );
}
