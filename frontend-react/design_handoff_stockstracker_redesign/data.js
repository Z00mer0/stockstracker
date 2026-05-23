/* mock data for stockstracker prototype — GPW focus */
const POSITIONS = [
  { sym: "DNP.WA",  name: "Dino Polska S.A.",       qty: 313.2546, avg: 32.98,  price: 31.67,  cur: "PLN", sector: "Retail",      d1: -2.49, w1: -1.45, m1: -3.20, y1: -8.4 },
  { sym: "MDV.WA",  name: "Medivet S.A.",           qty: 116,      avg: 82.00,  price: 77.32,  cur: "PLN", sector: "Health",      d1: -4.28, w1: -3.10, m1: -5.40, y1: -12.1 },
  { sym: "DIA.WA",  name: "Diagnostyka S.A.",       qty: 24,       avg: 159.13, price: 161.50, cur: "PLN", sector: "Health",      d1: -0.12, w1: +0.80, m1: +1.10, y1: +4.2 },
  { sym: "XTB.WA",  name: "XTB S.A.",               qty: 36,       avg: 100.02, price: 107.50, cur: "PLN", sector: "Finance",     d1: +0.22, w1: +2.10, m1: +5.80, y1: +24.5 },
  { sym: "MRB.WA",  name: "Mirbud S.A.",            qty: 213,      avg: 10.72,  price: 10.38,  cur: "PLN", sector: "Construction",d1: -1.24, w1: -0.80, m1: -2.10, y1: +8.4 },
  { sym: "CDR.WA",  name: "CD Projekt S.A.",        qty: 8,        avg: 240.60, price: 255.50, cur: "PLN", sector: "Gaming",      d1: -0.66, w1: +1.45, m1: +6.20, y1: +18.4 },
  { sym: "S2B.WA",  name: "Selvita S.A.",           qty: 55,       avg: 28.12,  price: 32.95,  cur: "PLN", sector: "Health",      d1: -0.17, w1: +2.40, m1: +8.10, y1: +42.8 },
  { sym: "MSW.WA",  name: "Mostostal Warszawa S.A.", qty: 150,     avg: 8.19,   price: 4.10,   cur: "PLN", sector: "Construction",d1: -1.68, w1: -4.20, m1: -12.40,y1: -48.2 },
  { sym: "MOD.WA",  name: "Modivo S.A.",            qty: 116,      avg: 82.27,  price: 78.84,  cur: "PLN", sector: "Retail",      d1: -0.91, w1: -2.10, m1: -3.80, y1: -5.4 },
  { sym: "DGN.WA",  name: "Dr. Gerard S.A.",        qty: 24,       avg: 159.13, price: 168.20, cur: "PLN", sector: "Food",        d1: +1.04, w1: +2.80, m1: +4.50, y1: +14.2 },
  { sym: "SN2.WA",  name: "Synektik S.A.",          qty: 55,       avg: 28.12,  price: 29.60,  cur: "PLN", sector: "Health",      d1: +0.42, w1: +1.20, m1: +3.40, y1: +18.1 },
];

const TRANSACTIONS = [
  { date: "2026-04-29", type: "BUY",  sym: "XTB.WA", qty: 36,  price: 100.02, total: 3600.72,  cur: "PLN" },
  { date: "2026-04-28", type: "BUY",  sym: "S2B.WA", qty: 55,  price: 28.12,  total: 1546.60,  cur: "PLN" },
  { date: "2026-04-28", type: "BUY",  sym: "SN2.WA", qty: 55,  price: 28.12,  total: 1546.60,  cur: "PLN" },
  { date: "2026-04-21", type: "BUY",  sym: "MRB.WA", qty: 213, price: 10.72,  total: 2283.36,  cur: "PLN" },
  { date: "2026-04-21", type: "BUY",  sym: "DGN.WA", qty: 24,  price: 159.13, total: 3819.12,  cur: "PLN" },
  { date: "2026-04-17", type: "BUY",  sym: "DIA.WA", qty: 55,  price: 159.13, total: 8752.15,  cur: "PLN" },
  { date: "2026-04-16", type: "BUY",  sym: "DIA.WA", qty: 24,  price: 159.13, total: 3819.12,  cur: "PLN" },
  { date: "2026-04-09", type: "BUY",  sym: "MDV.WA", qty: 116, price: 82.00,  total: 9512.00,  cur: "PLN" },
  { date: "2026-03-03", type: "BUY",  sym: "MSW.WA", qty: 150, price: 8.19,   total: 1228.50,  cur: "PLN" },
  { date: "2026-01-01", type: "BUY",  sym: "CDR.WA", qty: 8,   price: 240.60, total: 1924.80,  cur: "PLN" },
  { date: "2026-01-01", type: "BUY",  sym: "MOD.WA", qty: 116, price: 82.27,  total: 9543.32,  cur: "PLN" },
  { date: "2026-01-01", type: "BUY",  sym: "DNP.WA", qty: 313.2546, price: 32.98, total: 10330.82, cur: "PLN" },
];

const TICKER_STRIP = [
  { sym: "WIG20",   val: "2,418.12", d: +0.42 },
  { sym: "WIG30",   val: "2,945.10", d: +0.51 },
  { sym: "mWIG40",  val: "6,210.40", d: -0.18 },
  { sym: "S&P500",  val: "5,742.30", d: +0.18 },
  { sym: "DAX",     val: "18,902.1", d: -0.21 },
  { sym: "EUR/PLN", val: "4.2810",   d: -0.08 },
  { sym: "USD/PLN", val: "3.9420",   d: +0.12 },
];

function genSeries(seed, n, base, vol) {
  let rng = seed;
  const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
  const out = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v += (rand() - 0.48) * vol;
    out.push(v);
  }
  return out;
}

function computePortfolio() {
  let totalValue = 0, totalCost = 0, dayChange = 0;
  const enriched = POSITIONS.map(p => {
    const value = p.qty * p.price;
    const cost  = p.qty * p.avg;
    const pl    = value - cost;
    const plPct = (pl / cost) * 100;
    const dPLN  = value * (p.d1 / 100);
    totalValue += value;
    totalCost  += cost;
    dayChange  += dPLN;
    return { ...p, value, cost, pl, plPct, dPLN };
  });
  return {
    positions: enriched,
    totalValue,
    totalCost,
    totalPL: totalValue - totalCost,
    totalPLPct: ((totalValue - totalCost) / totalCost) * 100,
    dayChange,
    dayChangePct: (dayChange / (totalValue - dayChange)) * 100,
  };
}

window.MyFund = { POSITIONS, TRANSACTIONS, TICKER_STRIP, genSeries, computePortfolio };
