import React, { useState } from 'react';

const WIZARD_KEY = 'myfund_wizard_done';

export function shouldShowWizard(portfolio) {
  if (localStorage.getItem(WIZARD_KEY)) return false;
  return portfolio.length === 0;
}

export function dismissWizard() {
  localStorage.setItem(WIZARD_KEY, '1');
}

const PROFILES = [
  {
    key: 'conservative',
    label: 'Konserwatywny',
    icon: '🛡️',
    desc: 'Niskie ryzyko. Obligacje, lokaty, dywidendy.',
    alloc: '70% obligacje / 30% akcje',
  },
  {
    key: 'balanced',
    label: 'Zrównoważony',
    icon: '⚖️',
    desc: 'Umiarkowane ryzyko. Mix akcji i obligacji.',
    alloc: '50% akcje / 50% obligacje',
  },
  {
    key: 'aggressive',
    label: 'Agresywny',
    icon: '🚀',
    desc: 'Wysokie ryzyko. Akcje wzrostowe, crypto.',
    alloc: '90% akcje / 10% inne',
  },
];

const CURRENCIES = [
  { key: 'PLN', label: 'Złoty polski', symbol: 'zł', flag: '🇵🇱' },
  { key: 'USD', label: 'Dolar amerykański', symbol: '$', flag: '🇺🇸' },
  { key: 'EUR', label: 'Euro', symbol: '€', flag: '🇪🇺' },
  { key: 'GBP', label: 'Funt brytyjski', symbol: '£', flag: '🇬🇧' },
];

export default function SetupWizard({ onDone }) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(null);
  const [currency, setCurrency] = useState('PLN');

  function finish() {
    dismissWizard();
    // Save profile preference to localStorage for reference
    if (profile) localStorage.setItem('myfund_inv_profile', profile);
    localStorage.setItem('myfund_base_currency', currency);
    onDone();
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(6px)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  };
  const boxStyle = {
    background: 'var(--bg-2, #161b22)', border: '1px solid var(--border)',
    borderRadius: 16, padding: 32, width: '100%', maxWidth: 480,
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  };
  const stepDots = (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
      {[1, 2, 3].map(s => (
        <div key={s} style={{
          width: s === step ? 20 : 8, height: 8, borderRadius: 4, transition: 'all 0.3s',
          background: s <= step ? 'var(--accent)' : 'var(--border)',
        }} />
      ))}
    </div>
  );

  if (step === 1) return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        {stepDots}
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Witaj w MyFund! 👋
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 24 }}>
          Skonfigurujmy Twój portfel w 2 minuty. Najpierw — jaki masz profil inwestora?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {PROFILES.map(p => (
            <button key={p.key} onClick={() => setProfile(p.key)}
              style={{
                padding: '14px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                border: `2px solid ${profile === p.key ? 'var(--accent)' : 'var(--border)'}`,
                background: profile === p.key ? 'rgba(99,102,241,0.08)' : 'var(--panel)',
                transition: 'all 0.15s',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{p.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{p.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{p.desc}</div>
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 3, fontWeight: 600 }}>{p.alloc}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={finish} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'var(--border)', color: 'var(--text-dim)', fontSize: 13, border: 'none', cursor: 'pointer' }}>
            Pomiń
          </button>
          <button onClick={() => setStep(2)} disabled={!profile}
            style={{ flex: 2, padding: '10px 0', borderRadius: 8, background: profile ? 'var(--accent)' : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: profile ? 'pointer' : 'not-allowed', opacity: profile ? 1 : 0.5 }}>
            Dalej →
          </button>
        </div>
      </div>
    </div>
  );

  if (step === 2) return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        {stepDots}
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Waluta bazowa
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 24 }}>
          Wszystkie wartości portfela będą przeliczane do tej waluty.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {CURRENCIES.map(c => (
            <button key={c.key} onClick={() => setCurrency(c.key)}
              style={{
                padding: '14px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                border: `2px solid ${currency === c.key ? 'var(--accent)' : 'var(--border)'}`,
                background: currency === c.key ? 'rgba(99,102,241,0.08)' : 'var(--panel)',
                transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>{c.flag}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{c.key}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>{c.label}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setStep(1)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'var(--border)', color: 'var(--text-dim)', fontSize: 13, border: 'none', cursor: 'pointer' }}>
            ← Wstecz
          </button>
          <button onClick={() => setStep(3)}
            style={{ flex: 2, padding: '10px 0', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Dalej →
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={overlayStyle}>
      <div style={{ ...boxStyle, textAlign: 'center' }}>
        {stepDots}
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          Gotowe!
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 8 }}>
          Profil: <strong style={{ color: 'var(--text)' }}>{PROFILES.find(p => p.key === profile)?.label}</strong> · Waluta: <strong style={{ color: 'var(--text)' }}>{currency}</strong>
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 28 }}>
          Możesz teraz dodać swoje pierwsze spółki do portfela.
        </p>
        <button onClick={finish}
          style={{ padding: '12px 32px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          Zacznij dodawać spółki →
        </button>
      </div>
    </div>
  );
}
