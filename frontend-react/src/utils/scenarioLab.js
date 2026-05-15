// frontend-react/src/utils/scenarioLab.js

export const CONTRACT_SIZE = 100;
const R = 0.05; // risk-free rate

// ── Black-Scholes helpers ────────────────────────────────────────────────────

export function normCDF(x) {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y = 1 - (t*(a1+t*(a2+t*(a3+t*(a4+t*a5))))) * Math.exp(-ax*ax);
  return 0.5 * (1 + sign * y);
}

export function normPDF(x) {
  return Math.exp(-0.5*x*x) / Math.sqrt(2*Math.PI);
}

export function bsPrice(S, K, T, r, sigma, type) {
  if (T <= 0) return type === 'call' ? Math.max(0, S-K) : Math.max(0, K-S);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S/K) + (r + 0.5*sigma*sigma)*T) / (sigma*sqrtT);
  const d2 = d1 - sigma*sqrtT;
  if (type === 'call') return S*normCDF(d1) - K*Math.exp(-r*T)*normCDF(d2);
  return K*Math.exp(-r*T)*normCDF(-d2) - S*normCDF(-d1);
}

export function bsDelta(S, K, T, r, sigma, type) {
  if (T <= 0) return type==='call' ? (S>K?1:0) : (S<K?-1:0);
  const d1 = (Math.log(S/K) + (r+0.5*sigma*sigma)*T) / (sigma*Math.sqrt(T));
  return type === 'call' ? normCDF(d1) : normCDF(d1) - 1;
}

export function bsTheta(S, K, T, r, sigma, type) {
  if (T <= 0) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S/K) + (r+0.5*sigma*sigma)*T) / (sigma*sqrtT);
  const d2 = d1 - sigma*sqrtT;
  const base = -(S * normPDF(d1) * sigma) / (2*sqrtT);
  if (type === 'call') return (base - r*K*Math.exp(-r*T)*normCDF(d2)) / 365;
  return (base + r*K*Math.exp(-r*T)*normCDF(-d2)) / 365;
}

// ── Probability ──────────────────────────────────────────────────────────────

// P(S_T > target) using log-normal model (no drift)
function probAbove(S, target, iv, T) {
  if (T <= 0 || iv <= 0 || target <= 0) return target <= S ? 1 : 0;
  return 1 - normCDF(Math.log(target/S) / (iv * Math.sqrt(T)));
}

// ── Sigma bounds ─────────────────────────────────────────────────────────────

export function calcSigma(entry, iv, dte) {
  return entry * iv * Math.sqrt(dte / 365);
}

// Price array centered on entry ± 2 sigma
export function makePrices(entry, iv, dte, steps = 60) {
  const sigma = calcSigma(entry, iv, dte);
  const lo = Math.max(0.01, entry - 2*sigma);
  const hi = entry + 2*sigma;
  return Array.from({length: steps+1}, (_, i) => lo + (hi-lo)*i/steps);
}

// ── Payoff ───────────────────────────────────────────────────────────────────

export function calcPayoff(strategy, prices, params) {
  const { entry, qty, strike, strike2 = strike + 5, premium, T, iv, wing = 5 } = params;
  const C = CONTRACT_SIZE;
  const nC = qty / C;
  const r = R;

  const expiry = prices.map(p => {
    switch (strategy) {
      case 'long-call':        return (Math.max(0, p-strike) - premium) * C * qty;
      case 'long-put':         return (Math.max(0, strike-p) - premium) * C * qty;
      case 'covered-call':     return (p-entry)*qty + (Math.min(0, strike-p) + premium)*C*nC;
      case 'protective-put':   return (p-entry)*qty + (Math.max(0, strike-p) - premium)*C*nC;
      case 'csp':              return (Math.min(0, p-strike) + premium) * C;
      case 'bull-call-spread': return (Math.max(0,p-strike) - Math.max(0,p-strike2) - premium) * C * qty;
      case 'bear-put-spread':  return (Math.max(0,strike-p) - Math.max(0,strike2-p) - premium) * C * qty;
      case 'iron-condor': {
        const K1b = strike - wing, K2b = strike2 + wing;
        return (Math.max(0,K1b-p) - Math.max(0,strike-p) - Math.max(0,p-strike2) + Math.max(0,p-K2b) + premium) * C;
      }
      default: return 0;
    }
  });

  const t0 = prices.map(p => {
    const r2 = r;
    switch (strategy) {
      case 'long-call':
        return (bsPrice(p, strike, T, r2, iv, 'call') - premium) * C * qty;
      case 'long-put':
        return (bsPrice(p, strike, T, r2, iv, 'put') - premium) * C * qty;
      case 'covered-call':
        return (p-entry)*qty + (premium - bsPrice(p, strike, T, r2, iv, 'call'))*C*nC;
      case 'protective-put':
        return (p-entry)*qty + (bsPrice(p, strike, T, r2, iv, 'put') - premium)*C*nC;
      case 'csp':
        return (premium - bsPrice(p, strike, T, r2, iv, 'put')) * C;
      case 'bull-call-spread':
        return (bsPrice(p,strike,T,r2,iv,'call') - bsPrice(p,strike2,T,r2,iv,'call') - premium) * C * qty;
      case 'bear-put-spread':
        return (bsPrice(p,strike,T,r2,iv,'put') - bsPrice(p,strike2,T,r2,iv,'put') - premium) * C * qty;
      case 'iron-condor': {
        const K1b = strike - wing, K2b = strike2 + wing;
        return (bsPrice(p,K1b,T,r2,iv,'put') - bsPrice(p,strike,T,r2,iv,'put')
               - bsPrice(p,strike2,T,r2,iv,'call') + bsPrice(p,K2b,T,r2,iv,'call') + premium) * C;
      }
      default: return 0;
    }
  });

  const stock = prices.map(p => (p - entry) * qty);
  return { expiry, t0, stock };
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export function calcKPIs(strategy, params) {
  const { entry, qty, strike, strike2 = strike + 5, premium, T, iv, wing = 5 } = params;
  const C = CONTRACT_SIZE;
  const nC = qty / C;

  switch (strategy) {
    case 'long-call': {
      const be = strike + premium;
      const cost = premium * C * qty;
      return {
        breakevens: [be],
        maxProfit: Infinity,
        maxLoss: -cost,
        bpe: cost,
        moic: null,
        pop: probAbove(entry, be, iv, T),
      };
    }
    case 'long-put': {
      const be = strike - premium;
      const cost = premium * C * qty;
      return {
        breakevens: [be],
        maxProfit: (strike - premium) * C * qty,
        maxLoss: -cost,
        bpe: cost,
        moic: null,
        pop: 1 - probAbove(entry, be, iv, T),
      };
    }
    case 'covered-call': {
      const be = entry - premium;
      const maxProfit = (strike - entry + premium) * qty;
      const bpe = (entry - premium) * qty;
      return {
        breakevens: [be],
        maxProfit,
        maxLoss: -entry * qty,
        bpe,
        moic: bpe > 0 ? maxProfit / bpe : null,
        pop: probAbove(entry, be, iv, T),
      };
    }
    case 'protective-put': {
      const be = entry + premium;
      const maxLoss = -(entry - strike + premium) * qty;
      const bpe = (entry + premium) * qty;
      return {
        breakevens: [be],
        maxProfit: Infinity,
        maxLoss,
        bpe,
        moic: null,
        pop: probAbove(entry, be, iv, T),
      };
    }
    case 'csp': {
      const be = strike - premium;
      const maxProfit = premium * C;
      const maxLoss = -(strike - premium) * C;
      const bpe = strike * C;
      return {
        breakevens: [be],
        maxProfit,
        maxLoss,
        bpe,
        moic: bpe > 0 ? maxProfit / bpe : null,
        pop: probAbove(entry, be, iv, T),
      };
    }
    case 'bull-call-spread': {
      const be = strike + premium;
      const maxProfit = (strike2 - strike - premium) * C * qty;
      const maxLoss = -premium * C * qty;
      const bpe = premium * C * qty;
      return {
        breakevens: [be],
        maxProfit,
        maxLoss,
        bpe,
        moic: bpe > 0 ? maxProfit / bpe : null,
        pop: probAbove(entry, be, iv, T),
      };
    }
    case 'bear-put-spread': {
      const be = strike - premium;
      const maxProfit = (strike - strike2 - premium) * C * qty;
      const maxLoss = -premium * C * qty;
      const bpe = premium * C * qty;
      return {
        breakevens: [be],
        maxProfit,
        maxLoss,
        bpe,
        moic: bpe > 0 ? maxProfit / bpe : null,
        pop: 1 - probAbove(entry, be, iv, T),
      };
    }
    case 'iron-condor': {
      const beLo = strike - premium;
      const beHi = strike2 + premium;
      const maxProfit = premium * C;
      const maxLoss = -(wing - premium) * C;
      const bpe = (wing - premium) * C;
      const popHi = probAbove(entry, beHi, iv, T);
      const popLo = probAbove(entry, beLo, iv, T);
      return {
        breakevens: [beLo, beHi],
        maxProfit,
        maxLoss,
        bpe,
        moic: bpe > 0 ? maxProfit / bpe : null,
        pop: popLo - popHi,
      };
    }
    default:
      return { breakevens: [], maxProfit: 0, maxLoss: 0, bpe: 0, moic: null, pop: 0 };
  }
}

// ── Greeks ───────────────────────────────────────────────────────────────────

export function calcGreeks(strategy, params) {
  const { entry, strike, strike2 = strike + 5, T, iv, wing = 5 } = params;
  const r = R;

  function d(S, K, type) { return bsDelta(S, K, T, r, iv, type); }
  function th(S, K, type) { return bsTheta(S, K, T, r, iv, type); }

  switch (strategy) {
    case 'long-call':
      return { posDelta: d(entry,strike,'call'), posTheta: th(entry,strike,'call') };
    case 'long-put':
      return { posDelta: d(entry,strike,'put'), posTheta: th(entry,strike,'put') };
    case 'covered-call':
      return { posDelta: 1 - d(entry,strike,'call'), posTheta: -th(entry,strike,'call') };
    case 'protective-put':
      return { posDelta: 1 + d(entry,strike,'put'), posTheta: th(entry,strike,'put') };
    case 'csp':
      return { posDelta: -d(entry,strike,'put'), posTheta: -th(entry,strike,'put') };
    case 'bull-call-spread':
      return {
        posDelta: d(entry,strike,'call') - d(entry,strike2,'call'),
        posTheta: th(entry,strike,'call') - th(entry,strike2,'call'),
      };
    case 'bear-put-spread':
      return {
        posDelta: d(entry,strike,'put') - d(entry,strike2,'put'),
        posTheta: th(entry,strike,'put') - th(entry,strike2,'put'),
      };
    case 'iron-condor': {
      const K1b = strike - wing, K2b = strike2 + wing;
      return {
        posDelta: d(entry,K1b,'put') - d(entry,strike,'put') - d(entry,strike2,'call') + d(entry,K2b,'call'),
        posTheta: th(entry,K1b,'put') - th(entry,strike,'put') - th(entry,strike2,'call') + th(entry,K2b,'call'),
      };
    }
    default:
      return { posDelta: 0, posTheta: 0 };
  }
}
