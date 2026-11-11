import { cx } from './cx.js';

export default function PageHeader({ title, subtitle, actions, className }) {
  return (
    <header className={cx('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-h1 text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-dim">{subtitle}</p>}
      </div>
      {/* Bez własnych akcji zostaje puste miejsce o stałym id — strona może
          wstawić tu swoje przyciski portalem (np. „Edytuj układ” w Portfelu),
          zamiast zajmować nimi osobny rząd pod nagłówkiem. */}
      {actions
        ? <div className="flex flex-wrap items-center gap-2">{actions}</div>
        : <div id="page-header-actions" className="flex flex-wrap items-center gap-2 empty:hidden" />}
    </header>
  );
}
