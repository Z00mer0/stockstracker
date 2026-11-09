// Prognoza dochodu z dywidend na 12 miesięcy (od bieżącego miesiąca).
//
// Założenie: spółka wypłaci to samo co w ostatnich 12 miesiącach, w tych
// samych terminach — każda wypłata z historii przesunięta o rok. Ogłoszone
// dywidendy (kalendarz, wpisy ręczne) zastępują najbliższą przewidywaną
// (±60 dni) albo dochodzą jako nowe. Ilość akcji — dzisiejsza. Miesiąc wg daty
// wypłaty, jeśli ją znamy, w przeciwnym razie wg dnia dywidendy (odcięcia).
//
//   positions: [{ symbol, qty, currency }]
//   history:   { SYM: [{ date, amount }] }   — kwota na akcję, w walucie notowania
//   announced: [{ symbol, date, amount, payDate?, currency? }]
//   fx:        { USD: 3.9, … }  (PLN = 1)
//   taxRate:   (symbol, currency) → stawka łączna (0–1)

const MATCH_DAYS = 60;
const DAY = 86400000;

const shiftYear = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  const out = new Date(Date.UTC(y + 1, m - 1, d));
  if (out.getUTCMonth() !== m - 1) out.setUTCDate(0); // 29 lutego → 28
  return out.toISOString().slice(0, 10);
};
const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const daysBetween = (a, b) => Math.abs(new Date(a) - new Date(b)) / DAY;

export function forecastDividends({ positions = [], history = {}, announced = [], fx = {}, taxRate = () => 0.19, today }) {
  const first = today.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => ({ ym: addMonths(first, i), gross: 0, net: 0, items: [] }));
  const end = `${addMonths(first, 12)}-01`;
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const bySymbol = {};

  for (const pos of positions) {
    if (!(pos.qty > 0)) continue;
    const cur = pos.currency || 'PLN';
    const planned = (history[pos.symbol] ?? [])
      .filter(h => h.date > yearAgo && h.date <= today && h.amount > 0)
      .map(h => ({ date: shiftYear(h.date), amount: h.amount, announced: false }));
    for (const a of announced) {
      if (a.symbol !== pos.symbol || !(a.amount > 0) || !(a.date > today)) continue;
      let best = -1;
      planned.forEach((p, i) => {
        if (!p.announced && daysBetween(p.date, a.date) <= MATCH_DAYS && (best < 0 || daysBetween(p.date, a.date) < daysBetween(planned[best].date, a.date))) best = i;
      });
      const entry = { date: a.date, payDate: a.payDate, amount: a.amount, announced: true };
      if (best >= 0) planned[best] = entry; else planned.push(entry);
    }
    const rate = cur === 'PLN' ? 1 : fx[cur] ?? null;
    if (rate == null) continue;
    const tax = taxRate(pos.symbol, cur);
    for (const p of planned) {
      const when = p.payDate && p.payDate > today ? p.payDate : p.date;
      if (!(when > today) || when >= end) continue;
      const month = months.find(m => m.ym === when.slice(0, 7));
      if (!month) continue;
      const gross = pos.qty * p.amount * rate;
      const item = { symbol: pos.symbol, date: when, perShare: p.amount, currency: cur, gross, net: gross * (1 - tax), announced: p.announced };
      month.items.push(item);
      month.gross += item.gross;
      month.net += item.net;
      const s = (bySymbol[pos.symbol] ??= { symbol: pos.symbol, gross: 0, net: 0, count: 0 });
      s.gross += item.gross; s.net += item.net; s.count += 1;
    }
  }
  months.forEach(m => m.items.sort((a, b) => a.date.localeCompare(b.date)));
  const gross = months.reduce((s, m) => s + m.gross, 0);
  const net = months.reduce((s, m) => s + m.net, 0);
  const next = months.flatMap(m => m.items)[0] ?? null;
  return {
    months,
    gross, net,
    next,
    symbols: Object.values(bySymbol).sort((a, b) => b.gross - a.gross),
  };
}

// Historia na akcję z dywidend zapisanych w transakcjach — dla spółek, dla
// których Yahoo nie ma wypłat z ostatnich 12 miesięcy (częste na GPW, gdzie
// dywidendy dopisuje się ręcznie). Bez tego prognoza była pusta mimo
// wpisanych wypłat. Ręczny wpis ma kwotę na akcję i liczbę akcji; import
// brokera — samą kwotę, więc dzielimy ją przez akcje posiadane w tym dniu.
// Wpisy w innej walucie niż pozycja (dywidenda w walucie rachunku) pomijamy.
//   sharesAt: (symbol, date) → liczba akcji przed tym dniem
export function withRecordedDividends(history, transactions, positions, { today, isDiv, sharesAt }) {
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const out = { ...history };
  for (const pos of positions) {
    if (!(pos.qty > 0)) continue;
    if ((history[pos.symbol] ?? []).some(h => h.date > yearAgo && h.date <= today)) continue;
    const cur = pos.currency || 'PLN';
    const recorded = transactions
      .filter(t => isDiv(t) && t.symbol === pos.symbol && t.date && t.date.slice(0, 10) > yearAgo && t.date.slice(0, 10) <= today
        && (t.currency || 'PLN') === cur)
      .map(t => {
        const date = t.date.slice(0, 10);
        const shares = t.qty > 0 ? t.qty : sharesAt(pos.symbol, date);
        const amount = t.qty > 0 ? Number(t.price) : shares > 0 ? Number(t.price) / shares : 0;
        return { date, amount };
      })
      .filter(h => h.amount > 0);
    if (recorded.length) out[pos.symbol] = [...(history[pos.symbol] ?? []), ...recorded];
  }
  return out;
}
