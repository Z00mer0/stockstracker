import { useState } from 'react';
import { useT } from '../../context/LanguageContext';
import './auth.css';

/**
 * One-time display of account recovery codes (after registration or
 * regeneration in Settings). Codes are never shown again.
 */
export default function RecoveryCodes({ codes, onContinue }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob(
      [`myfund — ${t('rc_title')}\n\n${codes.join('\n')}\n`],
      { type: 'text/plain' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'myfund-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — user can still select manually */ }
  }

  return (
    <div className="auth-stage v-term">
      <div className="auth-card">
        <div className="auth-head">
          <h1 className="auth-title">{t('rc_title')}</h1>
          <p className="auth-sub">{t('rc_sub')}</p>
        </div>

        <div className="rc-grid">
          {codes.map((c) => (
            <span key={c} className="rc-code">{c}</span>
          ))}
        </div>

        <div className="rc-actions">
          <button type="button" className="rc-btn" onClick={download}>{t('rc_download')}</button>
          <button type="button" className="rc-btn" onClick={copy}>
            {copied ? t('rc_copied') : t('rc_copy')}
          </button>
        </div>

        <button type="button" className="auth-btn" onClick={onContinue}>
          {t('rc_continue')}
        </button>
      </div>
    </div>
  );
}
