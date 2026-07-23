import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext({ showToast: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const showToast = useCallback((message, opts = {}) => {
    const { type = 'info', duration = 4000 } = opts;
    const id = ++idRef.current;
    setToasts(ts => [...ts, { id, message, type }]);
    setTimeout(() => {
      setToasts(ts => ts.filter(t => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999,
          pointerEvents: 'none', maxWidth: 'calc(100vw - 32px)',
        }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              background: t.type === 'error'
                ? 'color-mix(in srgb, var(--down, #dc2626) 92%, black)'
                : 'var(--panel-2, #1f2937)',
              color: 'var(--text, #fff)',
              fontSize: 14,
              padding: '10px 20px',
              borderRadius: 12,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              border: t.type === 'error'
                ? '1px solid color-mix(in srgb, var(--down, #dc2626) 60%, transparent)'
                : '1px solid var(--border, transparent)',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
