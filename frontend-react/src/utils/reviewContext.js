// Dane portfela wysyłane do przeglądu AI („przegląd menedżera").
// Wyliczenia wydzielone z PortfolioReview, żeby dało się je przetestować.
import { normalizeType } from './transactions.js';
import { getTaxRate } from '../services/dividendService';

// bonds: [{ type, valuePLN, maturity? }] — już wycenione (CPI) przez wołającego.
export function buildReviewContext({
  portfolio = [], bonds = [], cash = {}, otherAssets = [], fxRates = {}, transactions = [],
  accountType = '', today = new Date(),
}) {
  const toPLN = (v, cur) => (v || 0) * (fxRates[cur] ?? 1);

  const positions = portfolio.map(p => {
    const valuePLN = toPLN(p.qty * (p.price ?? p.avgPrice), p.currency);
    const plPct = p.avgPrice > 0 && p.price != null
      ? ((p.price - p.avgPrice) / p.avgPrice) * 100 : null;
    return { symbol: p.symbol, name: p.name || undefined, currency: p.currency, valuePLN: Math.round(valuePLN), plPct: plPct != null ? Math.round(plPct * 10) / 10 : null };
  }).filter(p => p.valuePLN > 0);

  const bondsPLN = bonds.reduce((s, b) => s + b.valuePLN, 0);
  const cashPLN = Object.entries(cash).reduce((s, [cur, v]) => s + toPLN(v, cur), 0);
  const otherPLN = otherAssets.reduce((s, a) => s + toPLN(a.value, a.currency), 0);
  const stocksPLN = positions.reduce((s, p) => s + p.valuePLN, 0);
  const totalPLN = stocksPLN + bondsPLN + cashPLN + otherPLN;
  if (totalPLN <= 0) return null;

  const pct = v => Math.round((v / totalPLN) * 1000) / 10;

  // Ekspozycja walutowa: akcje wg waluty notowania, gotówka, obligacje (PLN)
  // i pozostałe aktywa. Wcześniej pozostałe aktywa pomijano, więc udziały
  // nie sumowały się do 100%.
  const curExp = {};
  const addExp = (cur, v) => { const c = cur || 'PLN'; curExp[c] = (curExp[c] || 0) + v; };
  positions.forEach(p => addExp(p.currency, p.valuePLN));
  Object.entries(cash).forEach(([cur, v]) => addExp(cur, toPLN(v, cur)));
  addExp('PLN', bondsPLN);
  otherAssets.forEach(a => addExp(a.currency, toPLN(a.value, a.currency)));
  const currencyExposure = Object.fromEntries(
    Object.entries(curExp).filter(([, v]) => v > 0).map(([k, v]) => [k, `${pct(v)}%`])
  );

  // Dywidendy 12 mies. (brutto, PLN). normalizeType: „DIVIDEND" z importu
  // brokera to też dywidenda — wcześniej liczono tylko „DIV".
  const cutoff = new Date(today); cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const divs = transactions.filter(tx => normalizeType(tx.type) === 'DIV' && tx.date >= cutoffStr);
  const gross = d => toPLN((d.price || 0) * (d.qty || 1), d.currency);
  const divGrossPLN = divs.reduce((s, d) => s + gross(d), 0);
  const divNetPLN = divs.reduce((s, d) => s + gross(d) * (1 - getTaxRate(d.symbol, d.currency, accountType)), 0);

  return {
    totalValuePLN: Math.round(totalPLN),
    accountType: accountType || 'standardowe (opodatkowane)',
    allocation: {
      stocks: `${pct(stocksPLN)}%`,
      treasuryBonds: `${pct(bondsPLN)}%`,
      cash: `${pct(cashPLN)}%`,
      otherAssets: `${pct(otherPLN)}%`,
    },
    currencyExposure,
    positions: positions
      .sort((a, b) => b.valuePLN - a.valuePLN)
      .map(p => ({ ...p, weight: `${pct(p.valuePLN)}%` })),
    bonds: bonds.length ? bonds : undefined,
    otherAssets: otherAssets.length
      ? otherAssets.map(a => ({ name: a.name, category: a.category, valuePLN: Math.round(toPLN(a.value, a.currency)) }))
      : undefined,
    dividends12m: divs.length
      ? { grossPLN: Math.round(divGrossPLN), netPLN: Math.round(divNetPLN), payments: divs.length }
      : undefined,
  };
}
