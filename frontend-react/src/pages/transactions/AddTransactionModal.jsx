import { useState } from 'react';
import { useT } from '../../context/LanguageContext';
import { useApp } from '../../context/AppContext';
import { Button, Field, Input, Modal, SegmentedControl, Select } from '../../components/ui';
import SymbolInput from '../../components/shared/SymbolInput.jsx';
import { usePriceOnDate } from '../../hooks/usePriceOnDate.js';
import { currencyForSymbol } from '../../utils/priceOnDate.js';

const TYPES = ['BUY', 'SELL', 'DIV', 'CASH'];
const TYPE_LABEL = { BUY: 'type_buy', SELL: 'type_sell', DIV: 'type_div', CASH: 'type_cash' };

// onSave(tx, { positions, cash }) — patrz utils/ledger.js.
// initial: wstępne wypełnienie (uzupełnianie historii pozycji z portfela).
export default function AddTransactionModal({ onSave, onClose, initial = null }) {
  const t = useT();
  const { portfolio = [] } = useApp();
  const [form, setForm] = useState({
    type: 'BUY',
    symbol: '',
    qty: '',
    price: '',
    currency: 'PLN',
    date: new Date().toISOString().slice(0, 10),
    note: '',
    fee: '',
    tax: '',
    ...initial,
  });
  const [positions, setPositions] = useState(initial?.positions ?? true);
  // Gotówka: przy zakupie domyślnie dopłata (jak w oknie dodawania pozycji),
  // przy sprzedaży przychód zostaje na rachunku. Wybór użytkownika wygrywa.
  const [toCash, setToCash] = useState(initial?.cash);
  const [withdrawal, setWithdrawal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const isCash = form.type === 'CASH';
  const isTrade = form.type === 'BUY' || form.type === 'SELL';
  const isDiv = form.type === 'DIV';
  const cashOn = toCash ?? (form.type === 'SELL' || isDiv);

  // Waluta: pozycji, jeśli ją masz, inaczej z notowań albo sufiksu symbolu.
  // Cena kupna/sprzedaży: zamknięcie z dnia transakcji. Obie podpowiedzi
  // znikają, gdy użytkownik wpisze własną wartość.
  const [currencyTouched, setCurrencyTouched] = useState(!!initial?.currency);
  const [priceTouched, setPriceTouched] = useState(!!initial?.price);
  const quote = usePriceOnDate(form.symbol, form.date, isTrade);
  const held = portfolio.find(h => h.symbol === form.symbol.trim().toUpperCase());
  const currency = currencyTouched || isCash
    ? form.currency
    : held?.currency ?? (isTrade ? quote?.currency : null) ?? currencyForSymbol(form.symbol) ?? form.currency;
  const autoPrice = isTrade && !priceTouched && quote ? String(+quote.price.toFixed(4)) : null;
  const priceVal = autoPrice ?? form.price;

  async function handleSave() {
    if (!isCash && !form.symbol.trim()) { setError(t('err_enter_symbol')); return; }
    const qty = isCash ? null : parseFloat(form.qty);
    const price = parseFloat(priceVal);
    if (!isCash && (isNaN(qty) || qty <= 0)) { setError(t('err_enter_qty_short')); return; }
    if (isNaN(price) || price < 0) { setError(t('err_enter_price_short')); return; }
    const fee = isTrade ? parseFloat(form.fee) : NaN;
    const tax = isDiv ? parseFloat(form.tax) : NaN;
    if (fee < 0 || tax < 0) { setError(t('err_enter_price_short')); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        id: Math.random().toString(36).slice(2, 10),
        type: form.type,
        symbol: isCash ? '' : form.symbol.trim().toUpperCase(),
        qty,
        // Gotówka: znak w kwocie, wypłata ujemna (jak w imporcie brokera).
        price: isCash && withdrawal ? -price : price,
        currency,
        date: form.date,
        note: form.note.trim(),
        ...(fee > 0 ? { fee } : {}),
        ...(tax >= 0 ? { tax } : {}),
      }, { positions: isTrade && positions, cash: (isTrade || isDiv) && cashOn });
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || e.message || t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="sm"
      title={t('add_transaction_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{t('save_btn')}</Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={e => { e.preventDefault(); handleSave(); }}>
        {/* Przełącznik typu na całą szerokość okna. */}
        <div className="[&_.seg]:flex [&_.seg]:w-full [&_.seg_button]:flex-1">
          <SegmentedControl
            options={TYPES.map(tp => ({ value: tp, label: t(TYPE_LABEL[tp]) }))}
            value={form.type}
            onChange={v => set('type', v)}
          />
        </div>
        {isCash ? (
          <SegmentedControl
            block
            aria-label={t('type_cash')}
            options={[{ value: 'in', label: t('cash_deposit') }, { value: 'out', label: t('cash_withdrawal') }]}
            value={withdrawal ? 'out' : 'in'}
            onChange={v => setWithdrawal(v === 'out')}
          />
        ) : (
          <SymbolInput
            id="add-tx"
            label={t('col_symbol')}
            placeholder={t('pf_eg').replace('{v}', 'AAPL, CDR.WA')}
            value={form.symbol}
            onChange={v => set('symbol', v.toUpperCase())}
          />
        )}
        <div className={isCash ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2'}>
          {!isCash && (
            <Field label={t('qty_short')}>
              <Input type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={form.qty} onChange={e => set('qty', e.target.value)} />
            </Field>
          )}
          <Field label={isCash ? t('col_value') : t('price_label')} hint={autoPrice ? t('price_close_on').replace('{date}', quote.date) : undefined}>
            <Input type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" value={priceVal} onChange={e => { set('price', e.target.value); setPriceTouched(true); }} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('currency_label')}>
            <Select value={currency} onChange={e => { set('currency', e.target.value); setCurrencyTouched(true); }}>
              {['PLN', 'USD', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t('col_date')}>
            <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </Field>
        </div>
        {isTrade && (
          <Field label={t('fee_label')}>
            <Input type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" suffix={currency} value={form.fee} onChange={e => set('fee', e.target.value)} />
          </Field>
        )}
        {isDiv && (
          <Field label={t('div_tax_label')} hint={t('div_tax_hint')}>
            <Input type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" suffix={currency} value={form.tax} onChange={e => set('tax', e.target.value)} />
          </Field>
        )}
        <Field label={t('note_optional')}>
          <Input value={form.note} onChange={e => set('note', e.target.value)} />
        </Field>
        {(isTrade || isDiv) && (
          <Field label={form.type === 'BUY' ? t('source_of_funds') : form.type === 'SELL' ? t('sale_proceeds') : t('div_payout')}>
            <SegmentedControl
              block
              aria-label={form.type === 'BUY' ? t('source_of_funds') : form.type === 'SELL' ? t('sale_proceeds') : t('div_payout')}
              options={form.type === 'BUY'
                ? [{ value: 'out', label: t('top_up') }, { value: 'cash', label: t('deduct_cash') }]
                : [{ value: 'cash', label: t('proceeds_to_cash') }, { value: 'out', label: t('proceeds_out') }]}
              value={cashOn ? 'cash' : 'out'}
              onChange={v => setToCash(v === 'cash')}
            />
          </Field>
        )}
        {isTrade && (
          <>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={positions} onChange={e => setPositions(e.target.checked)} />
              <span>
                <span className="block text-[13px] text-fg">{t('tx_update_position')}</span>
                <span className="block text-[11px] text-faint">{t('tx_history_only_hint')}</span>
              </span>
            </label>
          </>
        )}
        {error && <p role="alert" className="text-small text-down">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
