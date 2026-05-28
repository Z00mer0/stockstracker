// frontend-react/src/components/shared/ColumnPicker.jsx
import React, { useState, useRef, useEffect } from 'react';
import { COLUMN_DEFS } from '../../utils/portfolioColumns';

export default function ColumnPicker({ cols, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleToggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen(o => !o);
  }

  function toggle(key) {
    const def = COLUMN_DEFS.find(c => c.key === key);
    if (def?.fixed) return;
    if (cols.includes(key)) {
      onChange(cols.filter(c => c !== key));
    } else {
      // append after last visible column
      onChange([...cols, key]);
    }
  }

  function move(key, dir) { // dir: -1 = left, +1 = right
    const idx = cols.indexOf(key);
    if (idx === -1) return;
    const next = idx + dir;
    if (next < 0 || next >= cols.length) return;
    const arr = [...cols];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    onChange(arr);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors text-base"
        title="Konfiguruj kolumny"
      >
        ⚙️
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-60 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3"
        >
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-1">
            Widoczne kolumny
          </div>
          <div className="space-y-0.5">
            {COLUMN_DEFS.map(({ key, label, fixed }) => {
              const visible = cols.includes(key);
              const idx = cols.indexOf(key);
              return (
                <div key={key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-700/50">
                  <input
                    type="checkbox"
                    checked={visible}
                    disabled={!!fixed}
                    onChange={() => toggle(key)}
                    className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer disabled:cursor-default"
                  />
                  <span className={`flex-1 text-sm select-none ${
                    fixed ? 'text-slate-500' : visible ? 'text-slate-200' : 'text-slate-500'
                  }`}>
                    {label}
                  </span>
                  {visible && !fixed && (
                    <div className="flex gap-0.5 shrink-0">
                      <button
                        onClick={() => move(key, -1)}
                        disabled={idx === 0}
                        className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-25 rounded transition-colors text-xs"
                        title="Przesuń w lewo"
                      >←</button>
                      <button
                        onClick={() => move(key, 1)}
                        disabled={idx === cols.length - 1}
                        className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-25 rounded transition-colors text-xs"
                        title="Przesuń w prawo"
                      >→</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
