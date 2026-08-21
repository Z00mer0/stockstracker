// Kalkulator OKI (Osobiste Konto Inwestycyjne), start 2027.
//
// Zasady, ktore tu koduje:
//   * limit wolny od podatku = 100 000 zl (calosc konta, wliczajac czesc
//     oszczednosciowa),
//   * podatek roczny = 0.85% * max(0, srednia_wartosc_aktywow - limit),
//   * "srednia wartosc aktywow" liczona z probek w ciagu roku (miesiecznych),
//     zeby uwzglednic wzrost portfela, a nie tylko punkt startowy i koncowy —
//     to blizej ustawowej "sredniej z dziennych wycen" niz uproszczenie
//     (start+koniec)/2.
//
// Zwykle konto do porownania: podatek Belki 19% od zysku brutto rocznie
// (gdy uzytkownik "aktywnie zarzadza" — realizuje zysk co roku) lub tylko
// na koncu horyzontu (gdy trzyma bez sprzedazy).
//
// Wszystko liczone lokalnie, bez zapisu do DB. Zaden dobrany zestaw liczb
// nie jest wyliczeniem podatkowym — kalkulator sluzy do porownania rzedu
// wielkosci.

export const OKI_LIMIT = 100_000;
export const OKI_RATE = 0.0085;
export const BELKA_RATE = 0.19;

// Srednia wartosc aktywow w roku przy stalej stopie zwrotu.
//
// Wartosc rosnie geometrycznie: V(k) = start * (1+r)^(k/N) dla k=0..N.
// Bierzemy srednia arytmetyczna N+1 probek (start + N miesiecznych punktow),
// co odpowiada "usredniamy wycene miesieczna" — bardziej stabilne niz sama
// srednia geometryczna, blizej temu, co ustawa opisuje jako srednia dzienna.
export function meanValueOverYear(startValue, annualReturn, samples = 12) {
  if (!(startValue > 0)) return 0;
  const n = Math.max(1, Math.floor(samples));
  let sum = 0;
  for (let k = 0; k <= n; k++) {
    sum += startValue * Math.pow(1 + annualReturn, k / n);
  }
  return sum / (n + 1);
}

// Podatek OKI za jeden rok od danej sredniej wartosci aktywow.
export function okiTaxForYear(meanValue, limit = OKI_LIMIT, rate = OKI_RATE) {
  const excess = Math.max(0, meanValue - limit);
  return excess * rate;
}

// Symulacja rok po roku. Wynik: tablica { year, ... } dla year=1..years,
// oraz podsumowanie na koncu horyzontu.
//
// activelyManaged=true — zwykle konto realizuje Belke co roku (typowe
// zachowanie rebalansujacego inwestora). false — trzyma do konca, Belka
// naliczona jednorazowo na koncu horyzontu od skumulowanego zysku.
export function simulateOki({
  initialValue,
  annualReturnPct,
  years,
  activelyManaged = true,
  samplesPerYear = 12,
  limit = OKI_LIMIT,
  okiRate = OKI_RATE,
  belkaRate = BELKA_RATE,
}) {
  const r = (Number(annualReturnPct) || 0) / 100;
  const y = Math.max(1, Math.floor(years));
  const rows = [];

  let okiValue = initialValue;
  let regularValue = initialValue;
  let okiCumTax = 0;
  let regularCumTax = 0;

  for (let i = 1; i <= y; i++) {
    // OKI: srednia liczona od wartosci po wczorajszym podatku, tak jak
    // stan konta widziany przez podatnika. Podatek scieta pod koniec roku.
    const okiMean = meanValueOverYear(okiValue, r, samplesPerYear);
    const okiTax = okiTaxForYear(okiMean, limit, okiRate);
    const okiEnd = okiValue * (1 + r) - okiTax;

    // Zwykle konto: gdy aktywnie zarzadzamy, co roku realizujemy zysk i
    // placimy Belke. W przeciwnym razie kapital rosnie bez podatku, a
    // Belke placimy raz na koncu — nizej po petli.
    const regGrossEnd = regularValue * (1 + r);
    let regTax = 0;
    let regEnd = regGrossEnd;
    if (activelyManaged) {
      const gain = regGrossEnd - regularValue;
      if (gain > 0) {
        regTax = gain * belkaRate;
        regEnd = regGrossEnd - regTax;
      }
    }

    okiCumTax += okiTax;
    regularCumTax += regTax;

    rows.push({
      year: i,
      okiStart: okiValue,
      okiMean,
      okiExcess: Math.max(0, okiMean - limit),
      okiTax,
      okiEnd,
      regStart: regularValue,
      regGrossEnd,
      regTax,
      regEnd,
    });

    okiValue = okiEnd;
    regularValue = regEnd;
  }

  // Tryb "trzymam do konca" — Belka jednorazowo od skumulowanego zysku.
  if (!activelyManaged) {
    const totalGain = regularValue - initialValue;
    if (totalGain > 0) {
      const finalTax = totalGain * belkaRate;
      regularCumTax += finalTax;
      regularValue -= finalTax;
      const last = rows[rows.length - 1];
      last.regTax += finalTax;
      last.regEnd = regularValue;
    }
  }

  const okiNet = okiValue;
  const regularNet = regularValue;
  return {
    rows,
    okiNet,
    regularNet,
    okiCumTax,
    regularCumTax,
    advantage: okiNet - regularNet,
  };
}
