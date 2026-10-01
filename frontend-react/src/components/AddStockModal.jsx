import { useState, useEffect, useRef } from 'react';
import { useT } from '../context/LanguageContext';
import { Button, Field, Input, Modal, Select, SegmentedControl } from './ui';
import { cx } from './ui/cx.js';

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];

export default function AddStockModal({ existingPortfolio, onSave, onClose, initialSymbol = '' }) {
  const t = useT();
  const [symbol, setSymbol]    = useState(initialSymbol);
  const [mode, setMode]        = useState('qty');
  const [qty, setQty]          = useState('');
  const [price, setPrice]      = useState('');
  const [totalValue, setTotal] = useState('');
  const [currency, setCurrency] = useState('PLN');
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [date, setDate]        = useState(today);
  const [note, setNote]        = useState('');
  const [funding, setFunding]  = useState('topup');
  const [saving, setSaving]    = useState(false);
  const [error, setError]      = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug]  = useState(false);
  const [activeSug, setActiveSug] = useState(-1);
  const sugRef = useRef(null);
  const justPicked = useRef(false);

  useEffect(() => {
    if (justPicked.current) { justPicked.current = false; return; }
    if (symbol.length < 2) { setSuggestions([]); setShowSug(false); return; }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const { results } = await res.json();
        setSuggestions(results ?? []);
        setActiveSug(-1);
        setShowSug((results ?? []).length > 0);
      } catch { /* podpowiedzi są tylko ułatwieniem */ }
    }, 300);
    return () => clearTimeout(id);
  }, [symbol]);

  useEffect(() => {
    function onDown(e) { if (sugRef.current && !sugRef.current.contains(e.target)) setShowSug(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function pickSuggestion(s) {
    justPicked.current = true;
    setSymbol(s.symbol);
    setSuggestions([]);
    setShowSug(false);
    // Auto-set currency based on exchange
    if (s.exchange && (s.exchange.includes('Warsaw') || s.symbol.endsWith('.WA'))) setCurrency('PLN');
    else if (s.exchange && (s.exchange.includes('NYSE') || s.exchange.includes('NASDAQ') || s.exchange.includes('NasdaqGS') || s.exchange.includes('NasdaqCM'))) setCurrency('USD');
  }

  function onSymbolKey(e) {
    if (!showSug || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSug(i => Math.min(suggestions.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSug(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && activeSug >= 0) { e.preventDefault(); pickSuggestion(suggestions[activeSug]); }
    else if (e.key === 'Escape') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setShowSug(false); }
  }

  const existing = existingPortfolio.find(h => h.symbol === symbol.trim().toUpperCase());
  // Dokupienie istniejącej pozycji musi być w jej walucie: średnia cena
  // i gotówka liczą się w walucie pozycji. Wcześniej „Dokup" z Portfela
  // otwierał okno z PLN także dla AAPL — zakup w $ zapisywał się jako zł,
  // a gotówka schodziła z konta złotówkowego.
  const effCurrency = existing?.currency ?? currency;

  const resolvedQty   = mode === 'qty' ? parseFloat(qty) : parseFloat(totalValue) / parseFloat(price);
  const resolvedPrice = parseFloat(price);

  async function handleSave(e) {
    e?.preventDefault();
    const sym = symbol.trim().toUpperCase();
    if (!sym) { setError(t('err_enter_symbol')); return; }
    if (isNaN(resolvedQty) || resolvedQty <= 0) { setError(t('err_enter_qty')); return; }
    if (isNaN(resolvedPrice) || resolvedPrice <= 0) { setError(t('err_enter_price')); return; }
    setSaving(true); setError('');
    try {
      await onSave({ symbol: sym, qty: resolvedQty, price: resolvedPrice, currency: effCurrency, date, note: note.trim(), funding });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={t('add_stock_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" type="submit" form="add-stock" loading={saving}>{t('add_to_portfolio')}</Button>
        </>
      }
    >
      <form id="add-stock" onSubmit={handleSave} className="grid gap-4">
        <div className="relative" ref={sugRef}>
          <Field label={t('ticker_symbol')} hint={t('ticker_hint_gpw')}>
            <Input
              placeholder={t('ticker_placeholder')}
              value={symbol}
              onChange={e => { setSymbol(e.target.value); setShowSug(true); }}
              onFocus={() => suggestions.length > 0 && setShowSug(true)}
              onKeyDown={onSymbolKey}
              autoComplete="off"
              role="combobox"
              aria-expanded={showSug && suggestions.length > 0}
              aria-controls="add-stock-sug"
              aria-activedescendant={activeSug >= 0 ? `add-stock-sug-${activeSug}` : undefined}
            />
          </Field>
          {showSug && suggestions.length > 0 && (
            <ul id="add-stock-sug" role="listbox" className="absolute inset-x-0 top-[62px] z-10 max-h-64 overflow-y-auto rounded-card-sm border border-line bg-panel py-1 shadow-pop">
              {suggestions.map((s, i) => (
                <li
                  key={s.symbol}
                  id={`add-stock-sug-${i}`}
                  role="option"
                  aria-selected={i === activeSug}
                  onMouseDown={() => pickSuggestion(s)}
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
          {existing && (
            <p className="mt-1.5 text-[12px] text-warn">
              {t('already_own_prefix')} {existing.qty} {t('already_own_suffix')} {existing.avgPrice} {existing.currency} {t('will_average')}
            </p>
          )}
        </div>

        <SegmentedControl block aria-label={t('mode_qty')} options={[{ value: 'qty', label: t('mode_qty') }, { value: 'value', label: t('mode_value') }]} value={mode} onChange={setMode} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={mode === 'qty' ? t('qty_label') : t('value_label')}>
            <Input
              type="number" min="0" step="any" inputMode="decimal"
              placeholder={mode === 'qty' ? '10' : '1500'}
              value={mode === 'qty' ? qty : totalValue}
              onChange={e => (mode === 'qty' ? setQty(e.target.value) : setTotal(e.target.value))}
              suffix={mode === 'value' ? effCurrency : undefined}
            />
          </Field>
          <Field label={t('buy_price_label')}>
            <Input type="number" min="0" step="any" inputMode="decimal" placeholder="150.00" value={price} onChange={e => setPrice(e.target.value)} suffix={effCurrency} />
          </Field>
          <Field label={t('currency_label')} hint={existing ? t('currency_from_position') : undefined}>
            <Select value={effCurrency} disabled={!!existing} onChange={e => setCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t('buy_date_label')}>
            <Input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} />
          </Field>
        </div>

        <Field label={t('note_label')}>
          <Input placeholder={t('note_placeholder')} value={note} onChange={e => setNote(e.target.value)} />
        </Field>

        <Field label={t('source_of_funds')}>
          <SegmentedControl block aria-label={t('source_of_funds')} options={[{ value: 'topup', label: t('top_up') }, { value: 'cash', label: t('deduct_cash') }]} value={funding} onChange={setFunding} />
        </Field>

        {error && <p role="alert" className="text-small text-down">{error}</p>}
      </form>
    </Modal>
  );
}
