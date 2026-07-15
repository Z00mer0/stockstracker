import React from 'react';
import { useLanguage, useT } from '../../context/LanguageContext';
import { usePrivacy } from '../../context/PrivacyContext';

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

export default function InsightStrip({ positions = [], dailyChangePLN = 0, dailyChangePct = null, onSymbolClick }) {
  const { locale } = useLanguage();
  const t = useT();
  const { isPrivate } = usePrivacy();
  const blur = isPrivate ? ' privacy-blur' : '';

  function fmtPLN(n) {
    if (n == null || isNaN(n)) return '—';
    return (n >= 0 ? '+' : '') + Math.round(n).toLocaleString(locale) + ' zł';
  }

  const withPl = positions.filter(p => p.plPLN != null && p.costPLN > 0);
  const withDay = positions.filter(p => p.dailyChg != null);

  const best  = [...withPl].sort((a, b) => (b.plPLN / b.costPLN) - (a.plPLN / a.costPLN))[0];
  const worst = [...withPl].sort((a, b) => (a.plPLN / a.costPLN) - (b.plPLN / b.costPLN))[0];
  const mover = [...withDay].sort((a, b) => Math.abs(b.dailyChg) - Math.abs(a.dailyChg))[0];

  if (!best && !worst && !mover) return null;

  const bestPct  = best  ? (best.plPLN  / best.costPLN)  * 100 : null;
  const worstPct = worst ? (worst.plPLN / worst.costPLN) * 100 : null;
  const dayUp    = dailyChangePLN >= 0;

  return (
    <div className="insight-strip">
      {best && (
        <div className={'insight' + (onSymbolClick ? ' clickable' : '')} onClick={() => onSymbolClick?.(best)}>
          <span className="ins-dot" style={{ background: 'var(--up)' }} />
          <div className="ins-body">
            <div className="ins-label">{t('best_position')}</div>
            <div className="ins-text">
              {best.symbol.replace('.WA', '')}
              {' · '}
              <span className={'num up' + blur}>{fmtPct(bestPct)}</span>
            </div>
          </div>
        </div>
      )}
      {worst && worst.symbol !== best?.symbol && (
        <div className={'insight' + (onSymbolClick ? ' clickable' : '')} onClick={() => onSymbolClick?.(worst)}>
          <span className="ins-dot" style={{ background: 'var(--down)' }} />
          <div className="ins-body">
            <div className="ins-label">{t('under_pressure')}</div>
            <div className="ins-text">
              {worst.symbol.replace('.WA', '')}
              {' · '}
              <span className={'num down' + blur}>{fmtPct(worstPct)}</span>
            </div>
          </div>
        </div>
      )}
      {mover && (
        <div className={'insight' + (onSymbolClick ? ' clickable' : '')} onClick={() => onSymbolClick?.(mover)}>
          <span className="ins-dot" style={{ background: 'var(--info)' }} />
          <div className="ins-body">
            <div className="ins-label">{t('biggest_move')}</div>
            <div className="ins-text">
              {mover.symbol.replace('.WA', '')}
              {' · '}
              <span className={'num ' + (mover.dailyChg >= 0 ? 'up' : 'down')}>{fmtPct(mover.dailyChg)}</span>
            </div>
          </div>
        </div>
      )}
      {dailyChangePLN != null && (
        <div className="insight">
          <span className="ins-dot" style={{ background: dayUp ? 'var(--up)' : 'var(--down)' }} />
          <div className="ins-body">
            <div className="ins-label">{t('daily_result')}</div>
            <div className="ins-text">
              <span className={'num ' + (dayUp ? 'up' : 'down') + blur}>{fmtPLN(dailyChangePLN)}</span>
              {dailyChangePct != null && (
                <span className={isPrivate ? 'privacy-blur' : ''} style={{ fontSize: 11, color: dayUp ? 'var(--up)' : 'var(--down)', marginLeft: 4 }}>
                  {fmtPct(dailyChangePct)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
