import React from 'react';
import { useT, useLanguage } from '../../context/LanguageContext';

const SECTOR_KEY_MAP = {
  'Technology': 'sector_Technology',
  'Financial Services': 'sector_FinancialServices',
  'Healthcare': 'sector_Healthcare',
  'Consumer Cyclical': 'sector_ConsumerCyclical',
  'Consumer Defensive': 'sector_ConsumerDefensive',
  'Industrials': 'sector_Industrials',
  'Basic Materials': 'sector_BasicMaterials',
  'Energy': 'sector_Energy',
  'Utilities': 'sector_Utilities',
  'Real Estate': 'sector_RealEstate',
  'Communication Services': 'sector_CommunicationServices',
  'Inne': 'sector_Other',
};

const SECTOR_COLORS = {
  Technology: '#7c9eff', Tech: '#7c9eff',
  Gaming: '#a78bfa',
  Energy: '#ffb020',
  'Consumer Cyclical': '#34d399', Retail: '#34d399',
  'Consumer Defensive': '#34d399',
  Auto: '#ff4d6d', Automotive: '#ff4d6d',
  Finance: '#22d3ee', Financials: '#22d3ee', 'Financial Services': '#22d3ee',
  Healthcare: '#f472b6', Health: '#f472b6',
  'Basic Materials': '#fb923c', Construction: '#fb923c',
  Food: '#facc15', 'Consumer Staples': '#facc15',
  Communication: '#60a5fa', 'Communication Services': '#60a5fa',
  Utilities: '#a3e635',
  'Real Estate': '#f87171',
  Industrials: '#fbbf24',
  Inne: '#8a929d',
};

function getColor(sector) {
  return SECTOR_COLORS[sector] || '#8a929d';
}

export default function StackedAllocation({ positions = [], totalValue, currency = 'PLN' }) {
  const t = useT();
  const { locale } = useLanguage();

  const currencySymbol = currency === 'PLN' ? ' zł' : ` ${currency}`;

  function fmtK(n) {
    if (n == null) return '—';
    return (n / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k' + currencySymbol;
  }

  const bySector = {};
  positions.forEach(p => {
    const sec = p.sector || 'Inne';
    bySector[sec] = (bySector[sec] || 0) + (p.valuePLN ?? 0);
  });

  const total = totalValue || Object.values(bySector).reduce((a, b) => a + b, 0) || 1;
  const slices = Object.entries(bySector)
    .map(([key, value]) => ({
      label: SECTOR_KEY_MAP[key] ? t(SECTOR_KEY_MAP[key]) : key,
      value,
      color: getColor(key),
    }))
    .sort((a, b) => b.value - a.value);

  if (!slices.length) return null;

  return (
    <div className="stack-alloc">
      <div className="stack-bar">
        {slices.map((s, i) => {
          const pct = (s.value / total) * 100;
          return (
            <div
              key={i}
              className="stack-seg"
              style={{ flex: s.value, background: s.color }}
              title={`${s.label}: ${pct.toFixed(1)}%`}
            >
              {pct > 5 ? Math.round(pct) + '%' : ''}
            </div>
          );
        })}
      </div>
      <div className="stack-legend">
        {slices.map((s, i) => (
          <div className="lg" key={i}>
            <span className="sw" style={{ background: s.color }} />
            <span className="lg-name">{s.label}</span>
            <span className="lg-val">{fmtK(s.value)}</span>
            <span className="lg-pct">{((s.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
