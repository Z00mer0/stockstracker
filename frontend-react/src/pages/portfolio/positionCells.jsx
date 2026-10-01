import Chip from '../../components/shared/Chip';
import { fmtPeriod } from '../../hooks/usePortfolioMetrics';

export function fmt(n, decimals = 2, locale = 'pl-PL') {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const CUR_FLAG = { PLN: '🇵🇱', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧' };
const Dash = () => <span className="text-faint">—</span>;

// Zawartość komórki tabeli pozycji dla kolumny `key` (lista kolumn:
// utils/portfolioColumns). Kwoty w PLN przeliczane na walutę wyświetlania.
export function renderCell(key, pos, fxRates, divBySymbol, locale, displayCurrency = 'PLN') {
  const flag = CUR_FLAG[pos.currency] ?? pos.currency;
  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const toDisp = plnVal => (plnVal == null ? null : plnVal / (fxRates[displayCurrency] ?? 1));

  switch (key) {
    case 'qty':
      return <span className="text-fg">{fmt(pos.qty, pos.qty % 1 === 0 ? 0 : 4, locale)}</span>;
    case 'avgPrice':
      return <span className="text-dim">{fmt(pos.avgPrice, 2, locale)} <span className="text-xs">{flag}</span></span>;
    case 'price':
      return pos.price != null
        ? <span className="text-fg">{fmt(pos.price, 2, locale)} <span className="text-xs">{flag}</span></span>
        : <Dash />;
    case 'dailyChg':
      return pos.dailyChg == null ? <Dash /> : <Chip value={pos.dailyChg} />;
    case 'costPLN':
      return <span className="font-semibold text-fg">{fmt(toDisp(pos.costPLN), 2, locale)} {currLabel}</span>;
    case 'valuePLN': {
      const v = toDisp(pos.valuePLN);
      return v != null ? <span className="font-semibold text-fg">{fmt(v, 2, locale)} {currLabel}</span> : <Dash />;
    }
    case 'plPLN': {
      const v = toDisp(pos.plPLN);
      if (v == null) return <Dash />;
      return <span className={v >= 0 ? 'font-semibold text-up' : 'font-semibold text-down'}>{v >= 0 ? '+' : ''}{fmt(v, 2, locale)} {currLabel}</span>;
    }
    case 'period':
      return <span className="text-dim">{fmtPeriod(pos.periodDays)}</span>;
    case 'moic':
      return pos.moic != null ? <span className="text-fg">{fmt(pos.moic, 2, locale)}x</span> : <Dash />;
    case 'irr':
      if (pos.irr == null) return <Dash />;
      return <span className={pos.irr >= 0 ? 'text-up' : 'text-down'}>{pos.irr >= 0 ? '+' : ''}{fmt(pos.irr, 1, locale)}%</span>;
    case 'pe':
      return pos.pe != null ? <span className="text-dim">{fmt(pos.pe, 1, locale)}</span> : <Dash />;
    case 'peFwd':
      return pos.peFwd != null ? <span className="text-dim">{fmt(pos.peFwd, 1, locale)}</span> : <Dash />;
    case 'pb':
      return pos.pb != null ? <span className="text-dim">{fmt(pos.pb, 2, locale)}</span> : <Dash />;
    case 'divYoc': {
      const totalDiv = divBySymbol[pos.symbol] ?? 0;
      if (!totalDiv) return <Dash />;
      const dispCost = toDisp(pos.costPLN);
      const yoc = dispCost > 0 ? (toDisp(totalDiv) / dispCost) * 100 : null;
      return (
        <span className="font-semibold text-warn">
          {fmt(toDisp(totalDiv), 2, locale)} {currLabel}
          {yoc != null && <span className="ml-1 text-[11px] opacity-75">({fmt(yoc, 1, locale)}%)</span>}
        </span>
      );
    }
    default:
      return <Dash />;
  }
}
