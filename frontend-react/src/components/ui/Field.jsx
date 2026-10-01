import { cloneElement, isValidElement, useId } from 'react';
import { cx } from './cx.js';

// Etykieta + podpowiedź + błąd wokół jednej kontrolki. Field sam spina
// id/aria z kontrolką, więc czytnik ekranu odczyta etykietę i treść błędu,
// a pole z błędem dostaje czerwoną ramkę bez dodatkowych propsów.
export default function Field({ label, hint, error, required, className, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [errorId, hintId].filter(Boolean).join(' ') || undefined,
        required: required ?? children.props.required,
      })
    : children;

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={children?.props?.id ?? id} className="text-label font-semibold uppercase text-dim">
          {label}{required && <span className="text-down"> *</span>}
        </label>
      )}
      {control}
      {error
        ? <p id={errorId} className="text-small text-down">{error}</p>
        : hint && <p id={hintId} className="text-small text-faint">{hint}</p>}
    </div>
  );
}
