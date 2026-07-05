import { useState, useContext } from 'react';
import { AppContext } from '../../context/AppContext';

const DOMAIN_MAP = {
  // GPW
  'DNP.WA': 'marketdino.pl',
  'XTB.WA': 'xtb.com',
  'CDR.WA': 'cdprojekt.com',
  'ALE.WA': 'allegro.pl',
  'PXM.WA': 'polimex.pl',
  'CBF.WA': 'cyberfolks.pl',
  'S2B.WA': 'syn2bio.pl',
  'MDV.WA': 'eobuwie.pl',
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
  'ADBE': 'adobe.com',
  'ORCL': 'oracle.com',
  'CRM': 'salesforce.com',
  'AVGO': 'broadcom.com',
  'PANW': 'paloaltonetworks.com',
  'SNOW': 'snowflake.com',
  'SPOT': 'spotify.com',
  'UNH': 'unitedhealthgroup.com',
  'MELI': 'mercadolibre.com',
  'NVO': 'novonordisk.com',
  'PG': 'pg.com',
  'SOFI': 'sofi.com',
  'IBKR': 'interactivebrokers.com',
  'HIMS': 'forhims.com',
  'OSCR': 'hioscar.com',
  'ARM': 'arm.com',
  'ARE': 'are.com',
  'UBER': 'uber.com',
  'LYFT': 'lyft.com',
  'SQ': 'block.xyz',
  'PYPL': 'paypal.com',
  'SHOP': 'shopify.com',
  'ABNB': 'airbnb.com',
  'RBLX': 'roblox.com',
  'SNAP': 'snap.com',
  'TWLO': 'twilio.com',
  'NET': 'cloudflare.com',
  'DDOG': 'datadoghq.com',
  'ZS': 'zscaler.com',
  'CRWD': 'crowdstrike.com',
  'GTLB': 'gitlab.com',
  'MDB': 'mongodb.com',
  'ESTC': 'elastic.co',
  'S': 'sentinelone.com',
  'OKTA': 'okta.com',
  'DOCU': 'docusign.com',
  'ZM': 'zoom.us',
  'TEAM': 'atlassian.com',
  'NOW': 'servicenow.com',
  'WDAY': 'workday.com',
  'VEEV': 'veeva.com',
  'SPLK': 'splunk.com',
  'PATH': 'uipath.com',
  'DT': 'dynatrace.com',
  'RIVN': 'rivian.com',
  'LCID': 'lucidmotors.com',
  'NIO': 'nio.com',
  'BYD': 'bydauto.com',
  'F': 'ford.com',
  'GM': 'gm.com',
  'NKLA': 'nikolamotor.com',
  'DIS': 'disney.com',
  'CMCSA': 'comcast.com',
  'T': 'att.com',
  'VZ': 'verizon.com',
  'BA': 'boeing.com',
  'GE': 'ge.com',
  'RTX': 'rtx.com',
  'LMT': 'lockheedmartin.com',
  'NOC': 'northropgrumman.com',
  'JPM': 'jpmorganchase.com',
  'GS': 'goldmansachs.com',
  'MS': 'morganstanley.com',
  'BAC': 'bankofamerica.com',
  'WFC': 'wellsfargo.com',
  'C': 'citigroup.com',
  'BRK.B': 'berkshirehathaway.com',
  'ABBV': 'abbvie.com',
  'PFE': 'pfizer.com',
  'MRK': 'merck.com',
  'LLY': 'lilly.com',
  'AMGN': 'amgen.com',
  'GILD': 'gilead.com',
  'BIIB': 'biogen.com',
  'REGN': 'regeneron.com',
  'CVS': 'cvs.com',
  'MCK': 'mckesson.com',
  'XOM': 'exxonmobil.com',
  'CVX': 'chevron.com',
  'COP': 'conocophillips.com',
  'KO': 'coca-cola.com',
  'PEP': 'pepsico.com',
  'MCD': 'mcdonalds.com',
  'SBUX': 'starbucks.com',
  'NKE': 'nike.com',
  'COST': 'costco.com',
  'TGT': 'target.com',
  'HD': 'homedepot.com',
  'LOW': 'lowes.com',
  'AMGN': 'amgen.com',
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
