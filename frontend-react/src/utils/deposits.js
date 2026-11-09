// Lokaty i konta oszczędnościowe: wartość liczona z oprocentowania zamiast
// wpisywana ręcznie.
//   term    — lokata terminowa: odsetki proste, wypłacane na koniec okresu;
//             do tego czasu pokazujemy odsetki narosłe (netto).
//   savings — konto oszczędnościowe: kapitalizacja miesięczna, liczymy tylko
//             odsetki już dopisane (pełne miesiące od otwarcia).
// Podatek Belki (19%) pobierany przy każdej kapitalizacji, gdy belka !== false.

const DAY = 86400000;
const BELKA = 0.19;
const round2 = n => Math.round(n * 100) / 100;

const parse = s => (s ? new Date(`${s}T00:00:00Z`) : null);

function fullMonthsBetween(start, end) {
  let m = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) m -= 1;
  return Math.max(0, m);
}

/** @returns {{value:number, interest:number, matured:boolean}} */
export function depositValue(principal, deposit, today = new Date().toISOString().slice(0, 10)) {
  const p = Number(principal) || 0;
  const rate = (Number(deposit?.rate) || 0) / 100;
  const start = parse(deposit?.startDate);
  const now = parse(today);
  if (!start || !rate || !p || now < start) return { value: p, interest: 0, matured: false };
  const net = deposit.belka === false ? 1 : 1 - BELKA;

  if (deposit.kind === 'savings') {
    let v = p;
    for (let i = 0; i < fullMonthsBetween(start, now); i++) v += round2(v * rate / 12 * net);
    v = round2(v);
    return { value: v, interest: round2(v - p), matured: false };
  }

  const end = parse(deposit.endDate);
  const matured = !!end && now >= end;
  const until = end && matured ? end : now;
  const days = Math.max(0, Math.round((until - start) / DAY));
  const interest = round2(p * rate * days / 365 * net);
  return { value: round2(p + interest), interest, matured };
}

/** Pozycja „inne aktywa" z bieżącą wartością; `principal` zachowuje wpisaną kwotę. */
export function withDepositValue(asset, today) {
  if (!asset?.deposit) return asset;
  const { value, interest, matured } = depositValue(asset.value, asset.deposit, today);
  return { ...asset, principal: asset.value, value, interest, matured };
}
