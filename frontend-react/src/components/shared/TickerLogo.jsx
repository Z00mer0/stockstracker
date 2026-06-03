import { useState, useContext } from 'react';
import { AppContext } from '../../context/AppContext';

const DOMAIN_MAP = {
  // GPW
  'DNP.WA': 'dino.pl',
  'XTB.WA': 'xtb.com',
  'CDR.WA': 'cdprojekt.com',
  'ALE.WA': 'allegro.pl',
  'PXM.WA': 'polimex.pl',
  'CBF.WA': 'cyberfolks.pl',
  'S2B.WA': 'syn2bio.com',
  'MDV.WA': 'modivo.com',
  'MRB.WA': 'mirbud.pl',
  'DIA.WA': 'diagnostyka.pl',
  'ELT.WA': 'elektrotim.pl',
  'PKN.WA': 'orlen.pl',
  'PKO.WA': 'pkobp.pl',
  'PZU.WA': 'pzu.pl',
  'KGH.WA': 'kghm.com',
  'LPP.WA': 'lppsa.com',
  'CPS.WA': 'cyfrowypolsat.pl',
  'PGE.WA': 'gkpge.pl',
  'JSW.WA': 'jsw.pl',
  'OPL.WA': 'orange.pl',
  'MBK.WA': 'mbank.pl',
  'PEO.WA': 'pekao.com.pl',
  'SPL.WA': 'santander.pl',
  // US
  'AAPL': 'apple.com',
  'NVDA': 'nvidia.com',
  'HOOD': 'robinhood.com',
  'MSFT': 'microsoft.com',
  'GOOGL': 'google.com',
  'GOOG': 'google.com',
  'AMZN': 'amazon.com',
  'TSLA': 'tesla.com',
  'META': 'meta.com',
  'NFLX': 'netflix.com',
  'V': 'visa.com',
  'MA': 'mastercard.com',
  'WMT': 'walmart.com',
  'JNJ': 'jnj.com',
  'COIN': 'coinbase.com',
  'PLTR': 'palantir.com',
  'AMD': 'amd.com',
  'INTC': 'intel.com',
  'BABA': 'alibaba.com',
};

export default function TickerLogo({ symbol = '', size }) {
  const [imgErr, setImgErr] = useState(false);
  const ctx = useContext(AppContext);
  const logoMap = ctx?.logoMap ?? {};

  const chars = symbol.replace(/\.(WA|US|UK)$/i, '').slice(0, 2).toUpperCase();
  const domain = DOMAIN_MAP[symbol] ?? logoMap[symbol] ?? null;
  const cls = size === 'lg' ? 'ticker-logo ticker-logo-lg' : 'ticker-logo';
  const px = typeof size === 'number' ? size : size === 'lg' ? 56 : 32;
  const sizeStyle = typeof size === 'number' ? { width: px, height: px } : undefined;

  if (domain && !imgErr) {
    return (
      <span className={cls} style={{ ...sizeStyle, padding: 0, overflow: 'hidden', background: 'var(--bg)' }}>
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
          alt=""
          width={px}
          height={px}
          onError={() => setImgErr(true)}
          style={{ display: 'block', borderRadius: 6, objectFit: 'contain' }}
        />
      </span>
    );
  }

  return (
    <span className={cls} style={sizeStyle ? { ...sizeStyle, fontSize: Math.max(8, Math.floor(px * 0.35)) } : undefined}>
      {chars}
    </span>
  );
}
