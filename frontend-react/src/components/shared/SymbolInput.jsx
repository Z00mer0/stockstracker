import { useState, useEffect, useRef } from 'react';
import { Field, Input } from '../ui';
import { cx } from '../ui/cx.js';

// Pole symbolu z podpowiedziami spółek (/api/search). Wybór podpowiedzi
// idzie do onPick({ symbol, name, exchange }) — tam okno ustawia walutę.
export default function SymbolInput({ id, label, hint, placeholder, value, onChange, onPick, children }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const [activeSug, setActiveSug] = useState(-1);
  const sugRef = useRef(null);
  const justPicked = useRef(false);

  useEffect(() => {
    if (justPicked.current) { justPicked.current = false; return; }
    if (value.length < 2) { setSuggestions([]); setShowSug(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
        if (!res.ok) return;
        const { results } = await res.json();
        setSuggestions(results ?? []);
        setActiveSug(-1);
        setShowSug((results ?? []).length > 0);
      } catch { /* podpowiedzi są tylko ułatwieniem */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function onDown(e) { if (sugRef.current && !sugRef.current.contains(e.target)) setShowSug(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function pick(s) {
    justPicked.current = true;
    onChange(s.symbol);
    setSuggestions([]);
    setShowSug(false);
    onPick?.(s);
  }

  function onKey(e) {
    if (!showSug || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSug(i => Math.min(suggestions.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSug(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && activeSug >= 0) { e.preventDefault(); pick(suggestions[activeSug]); }
    else if (e.key === 'Escape') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setShowSug(false); }
  }

  return (
    <div className="relative" ref={sugRef}>
      <Field label={label} hint={hint}>
        <Input
          placeholder={placeholder}
          value={value}
          onChange={e => { onChange(e.target.value); setShowSug(true); }}
          onFocus={() => suggestions.length > 0 && setShowSug(true)}
          onKeyDown={onKey}
          autoComplete="off"
          autoCapitalize="characters"
          role="combobox"
          aria-expanded={showSug && suggestions.length > 0}
          aria-controls={`${id}-sug`}
          aria-activedescendant={activeSug >= 0 ? `${id}-sug-${activeSug}` : undefined}
        />
      </Field>
      {showSug && suggestions.length > 0 && (
        <ul id={`${id}-sug`} role="listbox" className="absolute inset-x-0 top-[62px] z-10 max-h-64 overflow-y-auto rounded-card-sm border border-line bg-panel py-1 shadow-pop">
          {suggestions.map((s, i) => (
            <li
              key={s.symbol}
              id={`${id}-sug-${i}`}
              role="option"
              aria-selected={i === activeSug}
              onMouseDown={() => pick(s)}
              onMouseEnter={() => setActiveSug(i)}
              className={cx('flex cursor-pointer items-center gap-2.5 px-3 py-2', i === activeSug && 'bg-panel-hover')}
            >
              <span className="min-w-[72px] font-mono text-[12px] font-bold text-accent-text">{s.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-dim">{s.name}</span>
              {s.exchange && <span className="shrink-0 text-[10px] text-faint">{s.exchange}</span>}
            </li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}
