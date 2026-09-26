import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CircleCheck, CircleAlert, TriangleAlert, Info, X } from 'lucide-react';
import { useT } from './LanguageContext';

const ToastContext = createContext({ showToast: () => {} });

// type: 'info' | 'success' | 'warn' | 'error'
// action: { label, onClick } — np. „Cofnij" po usunięciu (faza 5 redesignu).
const TONE = {
  info:    { Icon: Info,          color: 'var(--info)' },
  success: { Icon: CircleCheck,   color: 'var(--up)' },
  warn:    { Icon: TriangleAlert, color: 'var(--warn)' },
  error:   { Icon: CircleAlert,   color: 'var(--down)' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback(id => setToasts(ts => ts.filter(t => t.id !== id)), []);

  const showToast = useCallback((message, opts = {}) => {
    const { type = 'info', duration = 4000, action } = opts;
    const id = ++idRef.current;
    setToasts(ts => [...ts, { id, message, type, action }]);
    setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast: dismiss }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-6 left-1/2 z-[9999] flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center gap-2"
      >
        {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const t = useT();
  const { Icon, color } = TONE[toast.type] ?? TONE.info;
  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className="ui-sheet pointer-events-auto flex items-center gap-3 rounded-card border border-line bg-panel-2 py-2.5 pl-3.5 pr-2 text-sm text-fg shadow-pop"
    >
      <Icon size={17} aria-hidden style={{ color, flexShrink: 0 }} />
      <span className="min-w-0">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => { toast.action.onClick(); onDismiss(); }}
          className="ml-1 shrink-0 rounded-card-sm px-2 py-1 text-[13px] font-semibold text-accent-text hover:bg-panel-hover"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('close_btn')}
        className="shrink-0 rounded-card-sm p-1 text-faint hover:bg-panel-hover hover:text-fg"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
