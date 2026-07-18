import { useState } from 'react';
import { useT } from '../context/LanguageContext';
import { genAlertId } from '../services/watchlistService';

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

  function handleAdd() {
    if (kind === 'price') {
      if (!price || isNaN(parseFloat(price))) return;
      const target = parseFloat(price);
      const currentPrice = livePrice?.price ?? fallbackPrice ?? 0;
      const alreadyMet = (type === 'above' && currentPrice >= target)
                      || (type === 'below' && currentPrice <= target);
      onSave({ id: genAlertId(), kind, type, targetPrice: target, mode, triggered: mode === 'repeat' ? false : alreadyMet });
    } else if (kind === 'dailyChange') {
      const p = parseFloat(pct);
      if (!p || p <= 0) return;
      onSave({ id: genAlertId(), kind, type, targetPercent: p, mode, triggered: false });
    } else {
      onSave({ id: genAlertId(), kind, type, mode, triggered: false });
    }
  }

  const typeLabels = kind === 'price'
    ? { above: t('above_alert'), below: t('below_alert') }
    : kind === 'dailyChange'
      ? { above: t('alert_rise_min'), below: t('alert_fall_min') }
      : { above: t('alert_new_high'), below: t('alert_new_low') };

  const displayPrice = livePrice?.price ?? fallbackPrice;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" style={{ width: 340, padding: 24 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🔔 Alert — {symbol}</h2>
        {displayPrice != null && (
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12 }}>
            {livePrice?.price != null ? 'Aktualna cena: ' : ''}{Number(displayPrice).toFixed(2)} {currency ?? ''}
          </p>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[['price', 'alert_kind_price'], ['dailyChange', 'alert_kind_daily'], ['week52', 'alert_kind_week52']].map(([k, key]) => (
            <button key={k} onClick={() => switchKind(k)} className={`btn ${kind === k ? 'btn-primary' : ''}`}
              style={{ flex: 1, justifyContent: 'center', fontSize: 11, padding: '6px 4px' }}>
              {t(key)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {['above', 'below'].map(tp => (
            <button key={tp} onClick={() => setType(tp)} className={`btn ${type === tp ? 'btn-primary' : ''}`} style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}>
              {typeLabels[tp]}
            </button>
          ))}
        </div>
        {kind === 'price' && (
          <input type="number" placeholder={t('col_price')} value={price} onChange={e => setPrice(e.target.value)}
            className="field-input" style={{ marginBottom: 16 }} autoFocus />
        )}
        {kind === 'dailyChange' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input type="number" placeholder={t('alert_pct_placeholder')} value={pct} onChange={e => setPct(e.target.value)}
              className="field-input" style={{ flex: 1 }} autoFocus />
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>%</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {['once', 'rearm', 'repeat'].map(m => (
            <button key={m} onClick={() => setMode(m)} className={`btn ${mode === m ? 'btn-primary' : ''}`}
              style={{ flex: 1, justifyContent: 'center', fontSize: 11, padding: '6px 4px' }}>
              {t(`alert_mode_${m}`)}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 20, minHeight: 28 }}>{t(`alert_mode_${mode}_hint`)}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="btn" style={{ flex: 1, justifyContent: 'center' }}>{t('cancel')}</button>
          <button onClick={handleAdd} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{t('add_btn')}</button>
        </div>
      </div>
    </div>
  );
}
