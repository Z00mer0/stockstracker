import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, BarChart3, Coins, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import useCalendarData from '../hooks/useCalendarData';
import useDividendEvents from '../hooks/useDividendEvents';
import { PageSkeleton } from '../components/RouteFallback';
import { Button, Card, EmptyState, IconButton, Select, Skeleton, Spinner } from '../components/ui';
import { cx } from '../components/ui/cx.js';

function getMonday(date) {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dotClass(ev) {
  if (ev.type === 'EARN') return 'bg-info';
  if (ev.type === 'DIV') return 'bg-warn';
  if (ev.impact === 'High') return 'bg-down';
  if (ev.impact === 'Medium') return 'bg-warn';
  return 'bg-faint';
}

const IMPACT_OPTS = ['All', 'High', 'Medium', 'Low'];
const COUNTRIES = ['USD', 'EUR', 'GBP', 'PLN'];

export default function Calendar() {
  const t = useT();
  const { locale } = useLanguage();
  const { showToast } = useToast();
  const DAY_NAMES  = t('day_names');
  const MONTH_NAMES = t('months');
  const { portfolio, loading: appLoading } = useApp();
  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);
  const { events: calEvents, loading: calLoading } = useCalendarData(symbols);
  const { allCalendarEvents: divEvents, manualDividends, loading: divLoading, deleteDividend, addDividend } = useDividendEvents(symbols);

  // Połącz makro+earnings z dywidendami, posortuj po dacie
  const events = useMemo(() =>
    [...calEvents, ...divEvents].sort((a, b) => a.date.localeCompare(b.date)),
    [calEvents, divEvents]
  );
  const loading = calLoading || divLoading;
  const [selectedDay, setSelectedDay] = useState(null);
  const [filterImpact,  setFilterImpact]  = useState('All');
  const [filterCountry, setFilterCountry] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const today = toISO(new Date());

  // Build month grid: full weeks (Mon–Sun) covering the entire month
  const { weeks, calDays } = useMemo(() => {
    const year  = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth  = new Date(year, month + 1, 0);

    const gridStart = getMonday(firstOfMonth);
    const lastDow   = lastOfMonth.getDay();
    const gridEnd   = addDays(lastOfMonth, lastDow === 0 ? 0 : 7 - lastDow);

    const days = [];
    let d = new Date(gridStart);
    while (toISO(d) <= toISO(gridEnd)) {
      days.push(toISO(d));
      d = addDays(d, 1);
    }

    const ws = [];
    for (let i = 0; i < days.length; i += 7) ws.push(days.slice(i, i + 7));
    return { weeks: ws, calDays: days };
  }, [currentMonth]);

  const minDate = calDays[0];
  const maxDate = calDays[calDays.length - 1];
  const curMonthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;

  const byDate = useMemo(() => {
    const map = {};
    for (const ev of events) {
      (map[ev.date] ??= []).push(ev);
    }
    return map;
  }, [events]);

  const listEvents = useMemo(() => {
    let base = selectedDay
      ? events.filter(e => e.date === selectedDay)
      : events.filter(e => e.date >= minDate && e.date <= maxDate);
    const isPortfolioEvent = e => e.type === 'EARN' || e.type === 'DIV';
    if (filterImpact !== 'All')
      base = base.filter(e => isPortfolioEvent(e) || e.impact === filterImpact);
    if (filterCountry)
      base = base.filter(e => isPortfolioEvent(e) || e.currency === filterCountry);
    return base;
  }, [events, selectedDay, minDate, maxDate, filterImpact, filterCountry]);

  const groupedList = useMemo(() => {
    const groups = [];
    let lastDate = null;
    for (const ev of listEvents) {
      if (ev.date !== lastDate) { groups.push({ date: ev.date, items: [] }); lastDate = ev.date; }
      groups[groups.length - 1].items.push(ev);
    }
    return groups;
  }, [listEvents]);

  const prevMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => {
    const d = new Date();
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedDay(null);
  };

  // Ręczna dywidenda znikała jednym kliknięciem „×" — teraz z „Cofnij".
  function removeDividend(ev) {
    const original = manualDividends.find(d => d.id === ev.id);
    deleteDividend(ev.id);
    if (original) {
      const { id: _id, addedAt: _a, isManual: _m, ...rest } = original;
      showToast(t('cal_div_removed').replace('{sym}', ev.symbol), { type: 'success', action: { label: t('undo'), onClick: () => addDividend(rest) } });
    }
  }

  if (appLoading && !portfolio.length) return <PageSkeleton />;

  const monthLabel = `${Array.isArray(MONTH_NAMES) ? MONTH_NAMES[currentMonth.getMonth()] : ''} ${currentMonth.getFullYear()}`;
  const fmtDay = iso => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const impactLabel = o => (o === 'All' ? t('cal_all') : t(`cal_impact_${o.toLowerCase()}`));

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <IconButton icon={ChevronLeft} label={t('cal_prev_month')} onClick={prevMonth} />
              <h2 className="w-40 text-center text-[15px] font-semibold text-fg" aria-live="polite">{monthLabel}</h2>
              <IconButton icon={ChevronRight} label={t('cal_next_month')} onClick={nextMonth} />
            </div>
            <div className="flex items-center gap-2">
              {loading && <Spinner size="sm" label={t('loading')} />}
              <Button size="sm" onClick={goToday}>{t('today')}</Button>
              {selectedDay && <Button size="sm" variant="ghost" icon={X} onClick={() => setSelectedDay(null)}>{t('show_all').replace(/\s*×$/, '')}</Button>}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {DAY_NAMES.map(n => <div key={n} className="py-0.5 text-center text-[11px] font-semibold uppercase text-faint">{n}</div>)}
            {weeks.flat().map(date => {
              const dayEvs = byDate[date] ?? [];
              const isToday = date === today;
              const isSelected = date === selectedDay;
              const inMonth = date.startsWith(curMonthStr);
              return (
                <button
                  key={date}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${fmtDay(date)}${dayEvs.length ? ` · ${dayEvs.length} ${t('events_label').toLowerCase()}` : ''}`}
                  onClick={() => setSelectedDay(isSelected ? null : date)}
                  className={cx(
                    'rounded-card-sm border px-0.5 py-1.5 text-center transition-colors',
                    isSelected ? 'border-accent bg-accent text-accent-fg'
                      : isToday ? 'border-accent bg-panel-2' : 'border-transparent hover:bg-panel-hover',
                  )}
                >
                  <span className={cx('mb-1 block text-xs font-medium', isSelected ? 'text-accent-fg' : !inMonth ? 'text-faint opacity-40' : date < today ? 'text-faint' : 'text-fg')}>
                    {parseInt(date.slice(8), 10)}
                  </span>
                  <span className="flex min-h-2 flex-wrap justify-center gap-0.5">
                    {dayEvs.slice(0, 4).map((ev, i) => <span key={i} className={cx('h-1.5 w-1.5 rounded-full', dotClass(ev))} />)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-4 border-t border-line pt-3 text-xs text-faint">
            {[['bg-info', 'earn_legend'], ['bg-warn', 'div_macro_legend'], ['bg-down', 'macro_high_legend'], ['bg-faint', 'macro_low_legend']].map(([c, k]) => (
              <span key={k} className="flex items-center gap-1.5"><span className={cx('h-2 w-2 rounded-full', c)} />{t(k)}</span>
            ))}
          </div>
        </div>
      </Card>

      <Card
        title={selectedDay ? `${t('events_label')}: ${fmtDay(selectedDay)}` : `${t('events_label')} — ${monthLabel}`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Select aria-label={t('cal_impact')} value={filterImpact} onChange={e => setFilterImpact(e.target.value)} className="w-44">
              {IMPACT_OPTS.map(o => <option key={o} value={o}>{t('cal_impact')}: {impactLabel(o)}</option>)}
            </Select>
            <Select aria-label={t('currency_label')} value={filterCountry ?? ''} onChange={e => setFilterCountry(e.target.value || null)} className="w-44">
              <option value="">{t('currency_label')}: {t('cal_all')}</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        )}
      >
        {loading && listEvents.length === 0 ? (
          <div className="grid gap-4 px-4 py-4" aria-busy="true">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-1" />
                <div className="grid flex-1 gap-1.5"><Skeleton className={cx('h-3', ['w-1/2', 'w-2/3', 'w-5/6'][i % 3])} /><Skeleton className="h-2.5 w-1/4" /></div>
              </div>
            ))}
          </div>
        ) : groupedList.length === 0 ? (
          <EmptyState icon={CalendarDays} title={t('no_events')} description={!symbols.length ? t('add_to_portfolio_hint') : undefined} />
        ) : (
          groupedList.map(({ date, items }) => (
            <section key={date}>
              <h3 className={cx('px-4 py-2 text-label font-semibold uppercase', date === today ? 'bg-panel-2 text-info' : 'bg-bg text-faint')}>
                {fmtDay(date)}{date === today ? ` — ${t('today')}` : ''}
              </h3>
              {items.map((ev, i) => (
                <div key={i} className="flex items-start gap-3 border-t border-line px-4 py-3">
                  {ev.type === 'EARN' ? (
                    <>
                      <BarChart3 size={18} aria-hidden className="mt-0.5 shrink-0 text-info" />
                      <div className="text-[13px]"><span className="font-semibold text-fg">{ev.symbol}</span><span className="ml-2 text-xs text-dim">{t('financial_results')}</span></div>
                    </>
                  ) : ev.type === 'DIV' ? (
                    <>
                      <Coins size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
                      <div className="min-w-0 flex-1 text-[13px]">
                        <span className="font-semibold text-fg">{ev.symbol}</span>
                        <span className="ml-2 text-xs text-dim">{t('ex_dividend')}</span>
                        {ev.amount != null && <span className="ml-2 text-xs font-medium text-warn">{Number(ev.amount).toFixed(2)} {ev.currency ?? ''}</span>}
                        {ev.projected && <span className="ml-2 text-xs text-faint">{t('forecast_approx')}</span>}
                        {ev.isManual && <span className="ml-2 text-xs text-faint">{t('manual_source')}</span>}
                      </div>
                      {ev.isManual && <IconButton size="sm" icon={Trash2} label={`${t('delete_btn')} — ${ev.symbol}`} onClick={() => removeDividend(ev)} className="hover:text-down" />}
                    </>
                  ) : (
                    <>
                      <span className={cx('mt-0.5 h-5 w-1 shrink-0 rounded-full', ev.impact === 'High' ? 'bg-down' : ev.impact === 'Medium' ? 'bg-warn' : 'bg-faint')} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-fg">{ev.title}</div>
                        <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-faint">
                          {ev.currency && <span className="font-medium text-dim">{ev.currency}</span>}
                          {ev.time && <span>{ev.time}</span>}
                          {ev.forecast && <span>{t('forecast_colon')} <span className="text-fg">{ev.forecast}</span></span>}
                          {ev.previous && <span>{t('previous_colon')} <span className="text-dim">{ev.previous}</span></span>}
                        </div>
                      </div>
                      {ev.actual && <span className="shrink-0 text-[13px] font-semibold text-fg">{ev.actual}</span>}
                    </>
                  )}
                </div>
              ))}
            </section>
          ))
        )}
      </Card>
    </div>
  );
}
