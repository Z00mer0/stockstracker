import { useApp } from '../context/AppContext';
import { useT, useLanguage } from '../context/LanguageContext';

// Roczne limity wpłat (PLN) — ogłaszane co rok na bazie prognozowanego
// przeciętnego wynagrodzenia (IKE 3×, IKZE 1,2×, IKZE dla działalności 1,8×).
const LIMITS = {
  IKE:       { 2024: 23472,    2025: 26019,    2026: 28260 },
  IKZE:      { 2024: 9388.80,  2025: 10407.60, 2026: 11304 },
  IKZE_SELF: { 2024: 14083.20, 2025: 15611.40, 2026: 16956 },
};

export default function IkeLimitCard() {
  const { activePortfolio, transactions, fxRates } = useApp();
  const t = useT();
  const { locale } = useLanguage();

  const type = activePortfolio?.accountType;
  if (type !== 'IKE' && type !== 'IKZE') return null;

  const year = new Date().getFullYear();
  const limit = LIMITS[type]?.[year];
  const selfLimit = type === 'IKZE' ? LIMITS.IKZE_SELF?.[year] : null;

  const deposits = transactions
    .filter(tx => tx.type === 'CASH' && (tx.price ?? 0) > 0 && String(tx.date ?? '').startsWith(String(year)))
    .reduce((s, tx) => s + tx.price * (fxRates[tx.currency] ?? 1), 0);

  const fmt = n => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = limit ? Math.min((deposits / limit) * 100, 100) : 0;
  const over = limit != null && deposits > limit;

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            padding: '3px 10px', borderRadius: 6,
            background: 'var(--up-soft)', color: 'var(--up)', border: '1px solid var(--accent)',
          }}>{type}</span>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
            {t('ike_limit_title')} {year}
          </span>
        </div>
        <span className="mono" style={{ fontSize: 13, color: over ? 'var(--down)' : 'var(--text)' }}>
          {fmt(deposits)} zł{limit != null && <span style={{ color: 'var(--text-faint)' }}> / {fmt(limit)} zł</span>}
        </span>
      </div>
      {limit != null && (
        <div style={{ marginTop: 10, height: 8, borderRadius: 99, background: 'var(--panel-2)', overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 99,
            background: over ? 'var(--down)' : 'var(--accent)',
            transition: 'width 0.6s ease',
          }} />
        </div>
      )}
      <p style={{ fontSize: 11, color: over ? 'var(--down)' : 'var(--text-faint)', marginTop: 8, marginBottom: 0 }}>
        {over ? t('ike_limit_over') : t('ike_limit_note')}
        {selfLimit != null && ` ${t('ikze_self_note')} ${fmt(selfLimit)} zł.`}
      </p>
    </div>
  );
}
