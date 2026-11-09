// Cele inwestycyjne: „wartość portfela X do daty” albo „X zł dywidend
// miesięcznie”. Postęp i podpowiedź, ile odkładać, przy założonej stopie.
export const GOAL_RETURN = 0.06;      // roczna stopa do prognozy (ostrożnie, po inflacji ~3%)
export const GOAL_YIELD = 0.05;       // stopa dywidendy do celu dywidendowego

export function monthsUntil(deadline, now = new Date()) {
  if (!/^\d{4}-\d{2}$/.test(deadline || '')) return null;
  const [y, m] = deadline.split('-').map(Number);
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
}

// Miesięczna wpłata, żeby z `pv` dojść do `target` w `n` miesięcy przy stopie `annual`.
export function monthlyNeeded(pv, target, n, annual = GOAL_RETURN) {
  if (!(n > 0)) return null;
  const r = annual / 12;
  const grown = pv * (1 + r) ** n;
  if (grown >= target) return 0;
  return ((target - grown) * r) / ((1 + r) ** n - 1);
}

// goal: { kind: 'value' | 'dividends', target, deadline? }
// ctx: { value, monthlyDividends, now }
export function goalProgress(goal, { value = 0, monthlyDividends = 0, now = new Date() } = {}) {
  const current = goal.kind === 'dividends' ? monthlyDividends : value;
  const target = Number(goal.target) || 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const done = target > 0 && current >= target;
  const months = monthsUntil(goal.deadline, now);
  const out = { current, target, pct, done, months };
  if (goal.kind === 'dividends') {
    // Portfel potrzebny przy stopie dywidendy GOAL_YIELD i miesięczna wpłata do niego.
    out.capitalNeeded = (target * 12) / GOAL_YIELD;
    if (!done && months != null) out.monthly = monthlyNeeded(value, out.capitalNeeded, months);
  } else if (!done && months != null) {
    out.monthly = monthlyNeeded(value, target, months);
  }
  out.overdue = !done && months != null && months <= 0;
  return out;
}
