import { cx } from '../../components/ui/cx.js';

// Wiersz ustawienia: etykieta po lewej, wartość albo kontrolka po prawej.
export function Row({ label, value, children, className }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-2 border-b border-line py-3 last:border-b-0', className)}>
      <span className="text-[13px] text-dim">{label}</span>
      {children ?? <span className="text-[13px] font-medium text-fg">{value}</span>}
    </div>
  );
}

// Komunikat pod formularzem: błąd / sukces / informacja.
export function Note({ tone = 'info', children }) {
  if (!children) return null;
  return (
    <p role={tone === 'err' ? 'alert' : 'status'} className={cx('text-small', tone === 'err' ? 'text-down' : tone === 'ok' ? 'text-up' : 'text-dim')}>
      {children}
    </p>
  );
}

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
