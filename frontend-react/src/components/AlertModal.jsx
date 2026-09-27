import { useState } from 'react';
import { useT } from '../context/LanguageContext';
import { genAlertId } from '../services/watchlistService';
import { Button, Field, Input, Modal, SegmentedControl } from './ui';

// Uniwersalny modal alertu: cena / dzienna zmiana / 52W, tryby once/rearm/repeat.
// Używany zarówno na stronie Obserwowane, jak i w menu ⋯ w Portfelu.
// props:
//   symbol       — string, wymagany
//   currency     — string, opcjonalnie (pokaż obok ceny)
//   livePrice    — { price, dailyChg } | null | undefined
//   fallbackPrice — number | null (używane gdy livePrice nie ma; np. cena dodania na watchliście)
//   onClose()
//   onSave(alert)  — alert w kanonicznym formacie watchlisty
export default function AlertModal({ symbol, currency, livePrice, fallbackPrice = null, onClose, onSave }) {
  const t = useT();
  const [kind, setKind] = useState('price');
  const [type, setType] = useState('above');
  const [mode, setMode] = useState('rearm');
  const [price, setPrice] = useState(livePrice?.price != null
    ? String(livePrice.price.toFixed(2))
    : (fallbackPrice != null ? String(Number(fallbackPrice).toFixed(2)) : ''));
  const [pct, setPct] = useState('');

  function switchKind(k) {
    setKind(k);
    setMode(k === 'price' ? 'rearm' : 'repeat');
  }

  const displayPrice = livePrice?.price ?? fallbackPrice;
  const priceValid = kind !== 'price' || parseFloat(price) > 0;
  const pctValid = kind !== 'dailyChange' || parseFloat(pct) > 0;

  function handleAdd(e) {
    e?.preventDefault();
    if (!priceValid || !pctValid) return;
    if (kind === 'price') {
      const target = parseFloat(price);
      // Bez znanej ceny nie wiadomo, czy warunek już jest spełniony. Wcześniej
      // przyjmowano cenę 0, więc alert „poniżej" zapisywał się jako już
      // wyzwolony i nigdy nie przychodził.
      const alreadyMet = displayPrice != null && (
        (type === 'above' && displayPrice >= target) || (type === 'below' && displayPrice <= target));
      onSave({ id: genAlertId(), kind, type, targetPrice: target, mode, triggered: mode === 'repeat' ? false : alreadyMet });
    } else if (kind === 'dailyChange') {
      onSave({ id: genAlertId(), kind, type, targetPercent: parseFloat(pct), mode, triggered: false });
    } else {
      onSave({ id: genAlertId(), kind, type, mode, triggered: false });
    }
  }

  const typeLabels = kind === 'price'
    ? { above: t('above_alert'), below: t('below_alert') }
    : kind === 'dailyChange'
      ? { above: t('alert_rise_min'), below: t('alert_fall_min') }
      : { above: t('alert_new_high'), below: t('alert_new_low') };

  return (
    <Modal
      size="sm"
      title={`${t('alert_title')} — ${symbol}`}
      description={displayPrice != null
        ? `${livePrice?.price != null ? `${t('alert_current_price')} ` : ''}${Number(displayPrice).toFixed(2)} ${currency ?? ''}`
        : undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" type="submit" form="alert-form" disabled={!priceValid || !pctValid}>{t('add_btn')}</Button>
        </>
      }
    >
      <form id="alert-form" onSubmit={handleAdd} className="grid gap-3">
        <SegmentedControl
          block
          aria-label={t('alert_title')}
          options={[['price', 'alert_kind_price'], ['dailyChange', 'alert_kind_daily'], ['week52', 'alert_kind_week52']].map(([value, key]) => ({ value, label: t(key) }))}
          value={kind}
          onChange={switchKind}
        />
        <SegmentedControl block options={['above', 'below'].map(v => ({ value: v, label: typeLabels[v] }))} value={type} onChange={setType} />
        {kind === 'price' && (
          <Field label={t('col_price')}>
            <Input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} suffix={currency} />
          </Field>
        )}
        {kind === 'dailyChange' && (
          <Field label={t('alert_kind_daily')}>
            <Input type="number" min="0" step="any" inputMode="decimal" placeholder={t('alert_pct_placeholder')} value={pct} onChange={e => setPct(e.target.value)} suffix="%" />
          </Field>
        )}
        <Field label={t('alert_mode_label')} hint={t(`alert_mode_${mode}_hint`)}>
          <SegmentedControl block options={['once', 'rearm', 'repeat'].map(m => ({ value: m, label: t(`alert_mode_${m}`) }))} value={mode} onChange={setMode} />
        </Field>
      </form>
    </Modal>
  );
}
