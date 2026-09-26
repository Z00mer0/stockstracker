import { cx } from './cx.js';

export default function PageHeader({ title, subtitle, actions, className }) {
  return (
    <header className={cx('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-h1 text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-dim">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
