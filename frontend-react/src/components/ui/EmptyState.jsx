import { cx } from './cx.js';

// Pusty ekran, który mówi, co zrobić dalej — zamiast gołego „Brak danych".
export default function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      {Icon && (
        <span className="mb-1 grid h-12 w-12 place-items-center rounded-full border border-line bg-panel-2 text-dim">
          <Icon size={22} aria-hidden />
        </span>
      )}
      <p className="text-card-title text-fg">{title}</p>
      {description && <p className="max-w-sm text-small text-dim">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
