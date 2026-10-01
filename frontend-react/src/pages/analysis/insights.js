// „Smart Insights" — wnioski z pozycji portfela. Logika przeniesiona
// z Analysis.jsx; zmienione tylko rzeczy podatkowe (patrz niżej).
//
// positions: wycenione pozycje z costPLN > 0 — { symbol, valuePLN, costPLN,
//            pnlPLN, pnlPct, sector, pe, earningsTs }
// realizedYtdPLN: zrealizowany wynik w tym roku (jak na zakładce Podatki)
// taxable: false dla IKE/IKZE — tam nie ma podatku Belki
// Zwraca [{ kind: 'warn'|'up'|'down'|'info', title, lines: string[] }].

export const SECTOR_PE = {
  'Technology': 26, 'Financial Services': 15, 'Healthcare': 22,
  'Consumer Cyclical': 20, 'Consumer Defensive': 20, 'Energy': 14,
  'Industrials': 19, 'Communication Services': 21, 'Real Estate': 24,
  'Basic Materials': 16, 'Utilities': 18, 'Financial': 15,
};

const BELKA = 0.19;

export function buildInsights(positions, { t, locale, realizedYtdPLN = 0, taxable = true, now = Date.now() }) {
  const rp = (key, vars) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), t(key));
  const valid = positions.filter(p => p.valuePLN != null && p.costPLN > 0);
  if (!valid.length) return [];

  const totalValue  = valid.reduce((s, p) => s + p.valuePLN, 0);
  const totalCost   = valid.reduce((s, p) => s + p.costPLN, 0);
  const totalPnlPct = totalCost > 0 ? (valid.reduce((s, p) => s + p.pnlPLN, 0) / totalCost) * 100 : 0;
  const out = [];

  // 1. Koncentracja w jednej spółce
  const biggest = valid.map(p => ({ sym: p.symbol, pct: p.valuePLN / totalValue * 100 }))
    .sort((a, b) => b.pct - a.pct)[0];
  if (biggest?.pct > 25) {
    out.push({
      kind: 'warn',
      title: t('insight_conc_title'),
      lines: [
        rp('insight_conc_l1', { sym: biggest.sym, pct: biggest.pct.toFixed(0) }),
        t('insight_conc_l2'),
        '',
        t('insight_conc_opts'),
        rp('insight_conc_reduce', { sym: biggest.sym }),
        t('insight_conc_divers'),
        t('insight_conc_plan'),
      ],
    });
  }

  // 2. Koncentracja w sektorze
  const secMap = {};
  for (const p of valid) {
    const sec = p.sector || 'Inne';
    secMap[sec] = (secMap[sec] || 0) + p.valuePLN;
  }
  const topSec = Object.entries(secMap).sort((a, b) => b[1] - a[1])[0];
  if (topSec && topSec[1] / totalValue > 0.30 && topSec[0] !== 'Inne') {
    out.push({
      kind: 'warn',
      title: rp('insight_sec_title', { sec: topSec[0] }),
      lines: [
        rp('insight_sec_l1', { sec: topSec[0], pct: (topSec[1] / totalValue * 100).toFixed(0) }),
        '',
        t('insight_conc_opts'),
        t('insight_sec_add'),
        rp('insight_sec_reduce', { sec: topSec[0] }),
        t('insight_sec_etf'),
      ],
    });
  }

  // 3. Realizacja zysku — linia o podatku tylko na koncie opodatkowanym
  const bigWin = valid.filter(p => p.pnlPct > 100).sort((a, b) => b.pnlPct - a.pnlPct)[0];
  if (bigWin) {
    out.push({
      kind: 'up',
      title: rp('insight_profit_title', { sym: bigWin.symbol, pct: bigWin.pnlPct.toFixed(0) }),
      lines: [
        rp('insight_profit_l1', { pln: bigWin.pnlPLN.toFixed(0) }),
        ...(taxable ? [rp('insight_profit_l2', { tax: (bigWin.pnlPLN * BELKA).toFixed(0) })] : []),
        '',
        t('insight_profit_rec'),
        rp('insight_profit_sell', { sym: bigWin.symbol }),
        t('insight_profit_stop'),
        t('insight_profit_reinv'),
      ],
    });
  }

  // 4. Tax loss harvesting. Strata obniża podatek tylko do wysokości
  //    ZREALIZOWANEGO zysku w roku — wcześniej obiecywano 19% całej straty,
  //    gdy tylko jakaś pozycja miała zysk papierowy, i niezależnie od IKE/IKZE.
  //    Teraz ta sama reguła co na zakładce Podatki.
  const losers = valid.filter(p => p.pnlPLN < -500).sort((a, b) => a.pnlPLN - b.pnlPLN);
  const offsetable = Math.max(0, realizedYtdPLN);
  if (taxable && losers.length && offsetable > 0) {
    const totalLoss = Math.abs(losers.reduce((s, p) => s + p.pnlPLN, 0));
    const saving = Math.min(totalLoss, offsetable) * BELKA;
    out.push({
      kind: 'up',
      title: rp('insight_tlh_title', { saving: saving.toFixed(0) }),
      lines: [
        t('insight_tlh_l1'),
        '',
        t('insight_tlh_cands'),
        ...losers.slice(0, 3).map((p, i, a) => `${i === a.length - 1 ? '└' : '├'}─ ${p.symbol}: ${p.pnlPLN.toFixed(0)} PLN`),
        '',
        t('insight_tlh_wash'),
      ],
    });
  }

  // 5. Wycena (P/E względem sektora) — pierwsza pasująca spółka
  for (const p of valid) {
    const spe = p.sector ? SECTOR_PE[p.sector] : null;
    if (!spe || !p.pe || p.pe <= 0) continue;
    const diff = (p.pe - spe) / spe * 100;
    if (diff > 30) {
      out.push({
        kind: 'down',
        title: rp('insight_pe_exp_title', { sym: p.symbol }),
        lines: [
          rp('insight_pe_l1', { sym: p.symbol, pe: p.pe.toFixed(1), sec: p.sector, spe }),
          rp('insight_pe_exp_l2', { pct: diff.toFixed(0) }),
          '',
          t('insight_pe_rec'),
          rp('insight_pe_exp_limit', { sym: p.symbol }),
          t('insight_pe_exp_alert'),
          t('insight_pe_exp_alt'),
        ],
      });
      break;
    }
    if (diff < -15) {
      out.push({
        kind: 'up',
        title: rp('insight_pe_cheap_title', { sym: p.symbol }),
        lines: [
          rp('insight_pe_l1', { sym: p.symbol, pe: p.pe.toFixed(1), sec: p.sector, spe }),
          rp('insight_pe_cheap_l2', { pct: Math.abs(diff).toFixed(0) }),
          '',
          t('insight_pe_rec'),
          rp('insight_pe_cheap_buy', { sym: p.symbol }),
          t('insight_pe_cheap_chk'),
          t('insight_pe_cheap_ord'),
        ],
      });
      break;
    }
  }

  // 6. Wyniki kwartalne w ciągu 14 dni
  const in14 = now + 14 * 86400000;
  const upcoming = valid
    .filter(p => p.earningsTs && p.earningsTs * 1000 > now && p.earningsTs * 1000 < in14)
    .sort((a, b) => a.earningsTs - b.earningsTs);
  if (upcoming.length) {
    const fmtD = ts => new Date(ts * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
    out.push({
      kind: 'info',
      title: t('insight_earn_title'),
      lines: [
        t('insight_earn_in14'), '',
        ...upcoming.slice(0, 4).map((p, i, a) => `${i === a.length - 1 ? '└' : '├'}─ ${fmtD(p.earningsTs)}: ${p.symbol} ⭐`),
        '', t('insight_earn_warn'),
      ],
    });
  }

  // 7. Health Score (dywersyfikacja, wycena, wyniki, ryzyko) — wcześniej
  //    teksty tylko po polsku, także w wersji angielskiej.
  const bigPct = biggest?.pct || 0;
  let divScore = Math.min(10, Math.max(2, valid.length));
  if (bigPct > 40) divScore = Math.max(2, divScore - 3);
  else if (bigPct > 30) divScore = Math.max(3, divScore - 2);
  const perfScore = totalPnlPct > 50 ? 10 : totalPnlPct > 20 ? 8 : totalPnlPct > 0 ? 6 : totalPnlPct > -20 ? 4 : 2;
  const withPE = valid.filter(p => p.pe > 0 && p.sector && SECTOR_PE[p.sector]);
  let valScore = 6;
  if (withPE.length) {
    const overCnt = withPE.filter(p => p.pe > SECTOR_PE[p.sector] * 1.2).length;
    valScore = Math.max(1, Math.round(10 - (overCnt / withPE.length) * 6));
  }
  const riskScore = bigPct > 40 ? 4 : bigPct > 30 ? 5 : bigPct > 20 ? 7 : 8;
  const total = Math.round((divScore + valScore + perfScore + riskScore) / 4);
  const grade = total >= 8 ? 'good' : total >= 6 ? 'ok' : 'bad';
  out.push({
    kind: 'info',
    title: rp('insight_health_title', { total, label: t(`insight_health_${grade}`) }),
    lines: [
      `├─ ${t('insight_health_div')}: ${divScore}/10`,
      `├─ ${t('insight_health_val')}: ${valScore}/10`,
      `├─ ${t('insight_health_perf')}: ${perfScore}/10`,
      `└─ ${t('insight_health_risk')}: ${riskScore}/10`,
      '',
      t(`insight_health_rec_${grade}`),
    ],
  });

  return out;
}
