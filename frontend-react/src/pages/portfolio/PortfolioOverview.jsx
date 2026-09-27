import { useCallback, useEffect, useRef, useState } from 'react';
import GridLayout, { verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { LayoutGrid, Check, RotateCcw, LineChart } from 'lucide-react';
import { useLanguage, useT } from '../../context/LanguageContext';
import { lsSet } from '../../utils/safeStorage.js';
import HistoryChart from '../../components/HistoryChart';
import PortfolioPieChart from '../../components/PortfolioPieChart';
import StackedAllocation from '../../components/shared/StackedAllocation';
import UnrealizedPnlBar from '../../components/shared/UnrealizedPnlBar';
import { Button, EmptyState, SegmentedControl } from '../../components/ui';
import { cx } from '../../components/ui/cx.js';
import { fmt } from './positionCells.jsx';

// Karty na górze Portfela, które można przeciągać i zmieniać im rozmiar
// („Edytuj układ"). Układ zapamiętywany osobno dla portfela i dla telefonu.

const DASH_LAYOUT_KEY = 'portfolio_dash_layout_v6';
const DASH_ROW_H = 30;
const DASH_MARGIN = [12, 12];
const DASH_DEFAULT_LAYOUT = [
  { i: 'chart',   x: 0, y: 0,  w: 8,  h: 11, minW: 4, minH: 8, maxH: 20 },
  { i: 'stats',   x: 8, y: 0,  w: 4,  h: 11, minW: 2, minH: 4, maxH: 20 },
  // h/minH pierścienia liczone z treści, nie na oko: nagłówek 48 + wykres 220
  // + legenda w dwóch kolumnach 70 + odstępy 32 ≈ 370 px. 9 wierszy (366) to
  // absolutne minimum, więc domyślnie dajemy 10 (408) na zapas na inne
  // renderowanie czcionek. Przy h: 8 (324) karta ucinała czubek wykresu
  // i dwa ostatnie wiersze legendy.
  { i: 'pie',     x: 0, y: 11, w: 6,  h: 10, minW: 3, minH: 9, maxH: 20 },
  // minH 4 (132 px karty → ~84 px na treść) było gwarantem suwaka — nie zmieści
  // się nawet nagłówek + pasek + jeden wiersz legendy. 7 sektorów potrzebuje
  // ~250 px na treść, czyli 8 wierszy siatki (300 px).
  { i: 'alloc',   x: 6, y: 11, w: 6,  h: 8,  minW: 3, minH: 8, maxH: 20 },
  { i: 'realytd', x: 0, y: 19, w: 12, h: 8,  minW: 4, minH: 5, maxH: 20 },
];
// Poniżej tej szerokości grid zwija się do jednej kolumny (karty na całą
// szerokość, stos pionowy) — 12-kolumnowy układ desktopowy ściska i ucina
// treść na telefonie. Mobilny układ ma własny zapis, nie miesza się z desktopem.
const DASH_MOBILE_BREAKPOINT = 640;
const DASH_MOBILE_LAYOUT = [
  { i: 'chart',   x: 0, y: 0,  w: 12, h: 10, minW: 12, minH: 7, maxH: 20 },
  { i: 'stats',   x: 0, y: 10, w: 12, h: 8,  minW: 12, minH: 5, maxH: 20 },
  { i: 'pie',     x: 0, y: 18, w: 12, h: 10, minW: 12, minH: 9, maxH: 20 },
  { i: 'alloc',   x: 0, y: 28, w: 12, h: 8,  minW: 12, minH: 8, maxH: 20 },
  { i: 'realytd', x: 0, y: 36, w: 12, h: 8,  minW: 12, minH: 5, maxH: 20 },
];

// Zapisany układ z localStorage wygrywa z domyślnym, więc samo podniesienie
// minH w stałych nie naprawiłoby kart u nikogo, kto kiedykolwiek przestawił
// kafelki — zostaliby ze starą, za niską kartą i uciętym wykresem. Przy
// wczytywaniu podciągamy więc każdą kartę do aktualnego minimum; szerokości
// i pozycje zostają nietknięte.
function clampToMinH(saved, defaults) {
  const minH = new Map(defaults.map(d => [d.i, d.minH ?? 1]));
  return saved.map(item => {
    const floor = minH.get(item.i);
    return floor && item.h < floor ? { ...item, h: floor } : item;
  });
}

const TF_OPTIONS = ['1T', '1M', '3M', '6M', '1R', 'MAX'];
const TF_DAYS = { '1T': 7, '1M': 30, '3M': 90, '6M': 180, '1R': 365 };

export default function PortfolioOverview({
  activePortfolioId, snapshots, displayCurrency, fxRates, fxStale,
  totalValuePLN, staleTotal, metricsLoading, anyPriceLoaded, partialPrices, dailyChangePLN,
  totalCostPLN, positionsCount, positions, positionsValuePLN, ytdChartData, unrealizedData,
  portToDisp, portCurrLabel, portFx, onOpen,
}) {
  const t = useT();
  const { locale } = useLanguage();
  const year = new Date().getFullYear();

  const [dashLayout, setDashLayout] = useState(DASH_DEFAULT_LAYOUT);
  const [editMode, setEditMode] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const [tf, setTf] = useState('MAX');
  const [plView, setPlView] = useState('realized');
  const gridRoRef = useRef(null);

  const gridRef = useCallback(node => {
    if (gridRoRef.current) { gridRoRef.current.disconnect(); gridRoRef.current = null; }
    if (!node) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w > 0) setGridWidth(Math.floor(w));
    });
    ro.observe(node);
    gridRoRef.current = ro;
  }, []);

  const isMobile = gridWidth > 0 && gridWidth < DASH_MOBILE_BREAKPOINT;
  const defaultLayout = isMobile ? DASH_MOBILE_LAYOUT : DASH_DEFAULT_LAYOUT;
  // Osobny klucz dla mobile — desktopowy układ (12 kolumn) i mobilny (1 kolumna)
  // nie nadpisują się nawzajem.
  const layoutKey = `${DASH_LAYOUT_KEY}_${isMobile ? 'm_' : ''}${activePortfolioId}`;

  useEffect(() => {
    if (!activePortfolioId) return;
    try {
      const saved = localStorage.getItem(layoutKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const valid = Array.isArray(parsed) && parsed.every(item => item.h <= 20 && item.w <= 12 && item.h >= 1);
        setDashLayout(valid ? clampToMinH(parsed, defaultLayout) : defaultLayout);
      } else {
        setDashLayout(defaultLayout);
      }
    } catch {
      setDashLayout(defaultLayout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePortfolioId, layoutKey]);

  const saveLayout = useCallback(newLayout => {
    if (!activePortfolioId) return;
    lsSet(layoutKey, JSON.stringify(newLayout));
  }, [activePortfolioId, layoutKey]);

  const snapshotsSorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const snapshotsInRange = tf === 'MAX'
    ? snapshotsSorted
    : snapshotsSorted.filter(s => s.date >= new Date(Date.now() - (TF_DAYS[tf] || 30) * 86400000).toISOString().slice(0, 10));

  const head = extra => cx('card-head', editMode && 'cursor-grab', extra);
  const ytdLast = ytdChartData[ytdChartData.length - 1];

  return (
    <>
      <div className="mb-1.5 flex items-center justify-end gap-1.5">
        {editMode && (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => { setDashLayout(defaultLayout); saveLayout(defaultLayout); }}>
            {t('pf_layout_reset')}
          </Button>
        )}
        <Button
          size="sm"
          variant={editMode ? 'primary' : 'secondary'}
          icon={editMode ? Check : LayoutGrid}
          title={editMode ? t('pf_layout_done_hint') : t('pf_layout_edit_hint')}
          aria-pressed={editMode}
          onClick={() => setEditMode(v => !v)}
        >
          {editMode ? t('pf_layout_done') : t('pf_layout_edit')}
        </Button>
      </div>

      <div ref={gridRef} className={cx('mb-4 overflow-hidden', editMode && 'rgl-edit')}>
        {gridWidth > 0 && (
          <GridLayout
            layout={dashLayout}
            width={gridWidth}
            gridConfig={{ cols: 12, rowHeight: DASH_ROW_H, margin: DASH_MARGIN, containerPadding: [0, 0] }}
            dragConfig={{ enabled: editMode, handle: '.card-head', bounded: false, threshold: 5 }}
            resizeConfig={{ enabled: editMode, handles: isMobile ? ['s'] : ['se', 'sw', 'ne', 'nw', 'e', 's'] }}
            compactor={verticalCompactor}
            onLayoutChange={newLayout => { if (editMode) { setDashLayout(newLayout); saveLayout(newLayout); } }}
          >
            {/* Wartość portfela + wykres */}
            <div key="chart">
              <div className="card h-full">
                <div className={head('items-start !px-5 !pb-1 !pt-3.5')}>
                  <div className="min-w-0">
                    <div className="mb-1 text-label font-semibold uppercase text-faint">{t('portfolio_value_rail')}</div>
                    <div className="pv-total whitespace-nowrap text-[22px] font-semibold tracking-tight text-fg">
                      {totalValuePLN == null ? '—' : `${fmt(portToDisp(totalValuePLN), 2, locale)} ${portCurrLabel}`}
                      {staleTotal && <span className="ml-2 text-[11px] font-medium text-faint">~ {t('last_session')}</span>}
                    </div>
                    {metricsLoading && !anyPriceLoaded && !staleTotal && <div className="pv-daily mt-1 text-[11px] text-faint">{t('loading_prices')}</div>}
                    {partialPrices && <div className="pv-daily mt-1 text-[11px] text-warn">{t('prices_partial')}</div>}
                    {fxStale && <div className="pv-daily mt-1 text-[11px] text-warn">{fxStale === 'fallback' ? t('fx_fallback') : t('fx_stale')}</div>}
                    {dailyChangePLN != null && dailyChangePLN !== 0 && (
                      <div className={cx('pv-daily mt-1 text-xs', dailyChangePLN >= 0 ? 'text-up' : 'text-down')}>
                        {dailyChangePLN >= 0 ? '+' : ''}{fmt(portToDisp(dailyChangePLN), 2, locale)} {portCurrLabel} {t('today')}
                      </div>
                    )}
                  </div>
                  <SegmentedControl options={TF_OPTIONS} value={tf} onChange={setTf} />
                </div>
                <div className="px-3 pb-3.5 pt-1">
                  {snapshotsInRange.length >= 2
                    ? <HistoryChart data={snapshotsInRange} displayCurrency={displayCurrency} fxRate={fxRates[displayCurrency] ?? 1} />
                    : <EmptyState icon={LineChart} title={t('not_enough_history')} className="py-8" />}
                </div>
              </div>
            </div>

            {/* Statystyki */}
            <div key="stats">
              <div className="card flex h-full flex-col">
                <div className={head()}><div className="card-title">{t('stats_section')}</div></div>
                <div className="flex flex-1 flex-col justify-center px-5 pb-4 pt-2">
                  <div className="rail-stats">
                    <div className="rail-stat">
                      <span className="rs-lbl">{t('stats_cost')}</span>
                      <span className="rs-val">{fmt(portToDisp(totalCostPLN), 2, locale)} {portCurrLabel}</span>
                    </div>
                    <div className="rail-stat">
                      <span className="rs-lbl">{t('stats_daily')}</span>
                      {dailyChangePLN == null
                        ? <span className="rs-val text-faint">—</span>
                        : <span className={cx('rs-val', dailyChangePLN >= 0 ? 'text-up' : 'text-down')}>{dailyChangePLN >= 0 ? '+' : ''}{fmt(portToDisp(dailyChangePLN), 2, locale)} {portCurrLabel}</span>}
                    </div>
                    <div className="rail-stat" title={t('stats_beta_hint')}>
                      <span className="rs-lbl">{t('stats_beta')}</span>
                      <span className="rs-val text-faint">—<span className="ml-1.5 text-[10px] font-normal">({snapshotsSorted.length}/60)</span></span>
                    </div>
                    <div className="rail-stat">
                      <span className="rs-lbl">{t('stats_positions')}</span>
                      <span className="rs-val">{positionsCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Skład portfela */}
            <div key="pie">
              <div className="card flex h-full flex-col">
                <div className={head()}><div className="card-title">{t('pie_section')}</div></div>
                {/* „safe center", nie samo „center": zwykłe wyśrodkowanie przy
                    za niskiej karcie ucinało tyle samo u góry co u dołu, czyli
                    ścinało czubek pierścienia razem z etykietą największej
                    pozycji. Wariant safe centruje, dopóki treść się mieści, a gdy
                    się nie mieści — wraca do wyrównania od góry, więc znika
                    najwyżej ogon legendy. */}
                <div className="flex flex-1 flex-col items-center overflow-hidden px-5 pb-4 pt-2 [justify-content:safe_center]">
                  {positions.length > 0
                    ? <PortfolioPieChart positions={positions} totalValue={positionsValuePLN} currency={displayCurrency} fxRate={portFx} />
                    : <span className="text-[13px] text-faint">{t('no_data')}</span>}
                </div>
              </div>
            </div>

            {/* Alokacja sektorowa */}
            <div key="alloc">
              <div className="card flex h-full flex-col">
                <div className={head()}><div className="card-title">{t('alloc_section')}</div></div>
                {/* Ta sama historia co przy „Składzie portfela": overflow: auto
                    wyciągał wąski suwak, kiedy treść przelewała się o kilka
                    pikseli — a bez tego wszystko już się mieści. Idziemy na
                    hidden + safe center, żeby przy zbyt niskiej karcie ucinał się
                    ogon legendy, a nie pasek u góry. */}
                <div className="flex flex-1 flex-col overflow-hidden px-5 pb-4 pt-2 [justify-content:safe_center]">
                  {positions.length > 0
                    ? <StackedAllocation positions={positions} totalValue={positionsValuePLN} currency={displayCurrency} fxRate={portFx} />
                    : <span className="text-[13px] text-faint">{t('no_data')}</span>}
                </div>
              </div>
            </div>

            {/* Zysk zrealizowany YTD / niezrealizowany */}
            <div key="realytd">
              <div className="card flex h-full flex-col">
                <div className={head('items-start')}>
                  <div>
                    <div className="card-title">{plView === 'realized' ? t('pf_realized_ytd') : t('unreal_pl_title')}</div>
                    <div className="mt-0.5 text-[11px] text-faint">
                      {plView === 'realized' ? t('pf_realized_sub').replace('{year}', year) : t('unreal_pl_sub')}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
                    {plView === 'realized' && ytdLast && (
                      <div className={cx('pv-total whitespace-nowrap text-lg font-bold', ytdLast.pl >= 0 ? 'text-up' : 'text-down')}>
                        {ytdLast.pl >= 0 ? '+' : ''}{fmt(ytdLast.pl, 2, locale)} {portCurrLabel}
                      </div>
                    )}
                    {plView === 'unrealized' && unrealizedData.chartRows.length > 0 && (
                      <div className={cx('pv-total whitespace-nowrap text-right', unrealizedData.total >= 0 ? 'text-up' : 'text-down')}>
                        <div className="text-lg font-bold">{unrealizedData.total >= 0 ? '+' : ''}{fmt(unrealizedData.total, 2, locale)} {portCurrLabel}</div>
                        {unrealizedData.pct != null && <div className="text-[11px]">{unrealizedData.pct >= 0 ? '+' : ''}{fmt(unrealizedData.pct, 1, locale)}%</div>}
                      </div>
                    )}
                    <SegmentedControl
                      options={[{ value: 'realized', label: t('pf_realized') }, { value: 'unrealized', label: t('pf_unrealized') }]}
                      value={plView}
                      onChange={setPlView}
                    />
                  </div>
                </div>
                <div className="min-h-0 flex-1 px-2 pb-3 pt-1">
                  {plView === 'unrealized' ? (
                    unrealizedData.chartRows.length > 0 ? (
                      <UnrealizedPnlBar
                        rows={unrealizedData.chartRows}
                        currLabel={portCurrLabel}
                        locale={locale}
                        fmt={fmt}
                        onSymbolClick={sym => { const pos = positions.find(p => p.symbol === sym); if (pos) onOpen(pos); }}
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-[13px] text-faint">
                        {metricsLoading ? t('loading_prices') : t('pf_no_priced')}
                      </div>
                    )
                  ) : ytdChartData.length >= 2 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={ytdChartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                        <defs>
                          <linearGradient id="ytdGradUp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--up)" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="var(--up)" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="ytdGradDown" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--down)" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="var(--down)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} tickLine={false} axisLine={false}
                          tickFormatter={d => { if (!d) return ''; const [, m, day] = d.split('-'); return `${day}.${m}`; }} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-faint)' }} tickLine={false} axisLine={false} width={60}
                          tickFormatter={v => Number(v).toLocaleString(locale, { maximumFractionDigits: 0 })} />
                        <Tooltip
                          contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: 'var(--text-dim)', marginBottom: 4 }}
                          formatter={v => [`${v >= 0 ? '+' : ''}${fmt(v, 2, locale)} ${portCurrLabel}`, t('pf_pl_cum')]}
                          labelFormatter={d => { if (!d) return ''; const [y, m, day] = d.split('-'); return `${day}.${m}.${y}`; }}
                        />
                        <Area
                          type="monotone" dataKey="pl" strokeWidth={2}
                          stroke={ytdLast?.pl >= 0 ? 'var(--up)' : 'var(--down)'}
                          fill={ytdLast?.pl >= 0 ? 'url(#ytdGradUp)' : 'url(#ytdGradDown)'}
                          dot={ytdChartData.length <= 20 ? { r: 3, fill: 'var(--up)', strokeWidth: 0 } : false}
                          activeDot={{ r: 5 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="grid h-full place-items-center px-3 text-center text-[13px] text-faint">
                      {ytdChartData.length === 1 ? t('pf_ytd_one').replace('{year}', year) : t('pf_ytd_none').replace('{year}', year)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </GridLayout>
        )}
      </div>
    </>
  );
}
