import { useState } from 'react';
import { useT } from '../context/LanguageContext';
import { Button, Field, Input, Modal, Select, SegmentedControl } from './ui';
import SymbolInput from './shared/SymbolInput.jsx';
import { usePriceOnDate } from '../hooks/usePriceOnDate.js';
import { currencyForSymbol } from '../utils/priceOnDate.js';

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
  const [fee, setFee]          = useState('');
  const [funding, setFunding]  = useState('topup');
  const [saving, setSaving]    = useState(false);
  const [error, setError]      = useState('');
  // Waluta i cena podpowiadane z symbolu i kursu z dnia zakupu, dopóki
  // użytkownik sam ich nie zmieni.
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [priceTouched, setPriceTouched] = useState(false);
  const quote = usePriceOnDate(symbol, date);

  const existing = existingPortfolio.find(h => h.symbol === symbol.trim().toUpperCase());
  // Dokupienie istniejącej pozycji musi być w jej walucie: średnia cena
  // i gotówka liczą się w walucie pozycji. Wcześniej „Dokup" z Portfela
  // otwierał okno z PLN także dla AAPL — zakup w $ zapisywał się jako zł,
  // a gotówka schodziła z konta złotówkowego.
  const effCurrency = existing?.currency
    ?? (currencyTouched ? currency : quote?.currency ?? currencyForSymbol(symbol) ?? currency);
  const autoPrice = !priceTouched && quote ? String(+quote.price.toFixed(4)) : null;
  const priceVal = autoPrice ?? price;

  const resolvedQty   = mode === 'qty' ? parseFloat(qty) : parseFloat(totalValue) / parseFloat(priceVal);
  const resolvedPrice = parseFloat(priceVal);

  async function handleSave(e) {
    e?.preventDefault();
    const sym = symbol.trim().toUpperCase();
    if (!sym) { setError(t('err_enter_symbol')); return; }
    if (isNaN(resolvedQty) || resolvedQty <= 0) { setError(t('err_enter_qty')); return; }
    if (isNaN(resolvedPrice) || resolvedPrice <= 0) { setError(t('err_enter_price')); return; }
    const feeNum = parseFloat(fee);
    if (feeNum < 0) { setError(t('err_enter_price')); return; }
    setSaving(true); setError('');
    try {
      await onSave({ symbol: sym, qty: resolvedQty, price: resolvedPrice, currency: effCurrency, date, note: note.trim(), funding, ...(feeNum > 0 ? { fee: feeNum } : {}) });
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
        <SymbolInput
          id="add-stock"
          label={t('ticker_symbol')}
          hint={t('ticker_hint_gpw')}
          placeholder={t('ticker_placeholder')}
          value={symbol}
          onChange={setSymbol}
        >
          {existing && (
            <p className="mt-1.5 text-[12px] text-warn">
              {t('already_own_prefix')} {existing.qty} {t('already_own_suffix')} {existing.avgPrice} {existing.currency} {t('will_average')}
            </p>
          )}
        </SymbolInput>

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
          <Field label={t('buy_price_label')} hint={autoPrice ? t('price_close_on').replace('{date}', quote.date) : undefined}>
            <Input type="number" min="0" step="any" inputMode="decimal" placeholder="150.00" value={priceVal} onChange={e => { setPrice(e.target.value); setPriceTouched(true); }} suffix={effCurrency} />
          </Field>
          <Field label={t('currency_label')} hint={existing ? t('currency_from_position') : undefined}>
            <Select value={effCurrency} disabled={!!existing} onChange={e => { setCurrency(e.target.value); setCurrencyTouched(true); }}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t('buy_date_label')}>
            <Input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('fee_label')}>
            <Input type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" value={fee} onChange={e => setFee(e.target.value)} suffix={effCurrency} />
          </Field>
          <Field label={t('note_label')}>
            <Input placeholder={t('note_placeholder')} value={note} onChange={e => setNote(e.target.value)} />
          </Field>
        </div>

        <Field label={t('source_of_funds')}>
          <SegmentedControl block aria-label={t('source_of_funds')} options={[{ value: 'topup', label: t('top_up') }, { value: 'cash', label: t('deduct_cash') }]} value={funding} onChange={setFunding} />
        </Field>

        {error && <p role="alert" className="text-small text-down">{error}</p>}
      </form>
    </Modal>
  );
}
