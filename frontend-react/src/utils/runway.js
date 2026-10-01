// Kalkulator „na ile starczy kapitału": comiesięczne wypłaty, realna stopa
// zwrotu (po inflacji), kapitalizacja miesięczna.
//
// Wcześniej przy realnej stopie ≤ 0 liczono kapitał / wypłata, czyli jakby
// pieniądze nie traciły na wartości — przy zwrocie 2% i inflacji 5% wynik
// był zawyżony. Wzór zamknięty działa też dla ujemnej stopy; osobny
// przypadek potrzebny jest tylko dla stopy równej zero.
export function runway({ capital, monthly, returnPct, inflationPct }) {
  const r = (1 + returnPct / 100) / (1 + inflationPct / 100) - 1;
  const rm = Math.pow(1 + r, 1 / 12) - 1;
  const after = years => {
    const n = 12 * years;
    return Math.abs(rm) < 1e-12 ? capital - monthly * n : capital * Math.pow(1 + rm, n) - monthly * (Math.pow(1 + rm, n) - 1) / rm;
  };
  if (!(monthly > 0)) return { rm, eternal: true, months: null, after };
  if (Math.abs(rm) < 1e-12) return { rm, eternal: false, months: Math.floor(capital / monthly), after };
  const ratio = capital * rm / monthly;
  if (ratio >= 1) return { rm, eternal: true, months: null, after };
  return { rm, eternal: false, months: Math.floor(-Math.log(1 - ratio) / Math.log(1 + rm)), after };
}
