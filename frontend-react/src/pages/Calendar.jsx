import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../context/LanguageContext';
import useCalendarData from '../hooks/useCalendarData';
import useDividendEvents from '../hooks/useDividendEvents';
import Spinner from '../components/shared/Spinner';
import Card from '../components/shared/Card';

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

function dotColor(ev) {
  if (ev.type === 'EARN') return 'var(--info)';
  if (ev.type === 'DIV')  return 'var(--warn)';
  if (ev.impact === 'High') return 'var(--down)';
  if (ev.impact === 'Medium') return 'var(--warn)';
  return 'var(--text-faint)';
}

function impactBar(impact) {
  if (impact === 'High')   return 'var(--down)';
  if (impact === 'Medium') return 'var(--warn)';
  return 'var(--text-faint)';
}

const IMPACT_OPTS  = ['All', 'High', 'Medium', 'Low'];
const COUNTRY_OPTS = [
  { label: 'All',  value: null },
  { label: 'USD',  value: 'USD' },
  { label: 'EUR',  value: 'EUR' },
  { label: 'GBP',  value: 'GBP' },
  { label: 'PLN',  value: 'PLN' },
];

export default function Calendar() {
  const t = useT();
  const DAY_NAMES  = t('day_names');
  const MONTH_NAMES = t('months');
  const { portfolio, loading: appLoading } = useApp();
  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);
  const { events: calEvents, loading: calLoading } = useCalendarData(symbols);
  const { allCalendarEvents: divEvents, loading: divLoading, deleteDividend } = useDividendEvents(symbols);

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
  const goToday   = () => {
    const d = new Date();
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedDay(null);
  };

  if (appLoading && !portfolio.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Month grid */}
      <Card style={{ padding: '1.25rem' }}>
        {/* Header: navigation */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="btn btn-ghost w-8 h-8 flex items-center justify-center text-lg"
            >‹</button>
            <h2 className="text-sm font-semibold w-36 text-center" style={{ color: 'var(--text)' }}>
              {Array.isArray(MONTH_NAMES) ? MONTH_NAMES[currentMonth.getMonth()] : ''} {currentMonth.getFullYear()}
            </h2>
            <button
              onClick={nextMonth}
              className="btn btn-ghost w-8 h-8 flex items-center justify-center text-lg"
            >›</button>
          </div>
          <div className="flex items-center gap-3">
            {loading && <Spinner size="sm" />}
            <button
              onClick={goToday}
              className="btn"
            >
              {t('today')}
            </button>
            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="text-xs transition-colors"
                style={{ color: 'var(--info)' }}
              >
                {t('show_all')}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: '320px' }}>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_NAMES.map(n => (
                <div key={n} className="text-center text-xs py-0.5" style={{ color: 'var(--text-faint)' }}>{n}</div>
              ))}
            </div>

            {/* Weeks */}
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                {week.map(date => {
                  const dayEvs    = byDate[date] ?? [];
                  const isToday    = date === today;
                  const isSelected = date === selectedDay;
                  const isPast     = date < today;
                  const inMonth    = date.startsWith(curMonthStr);

                  let cellStyle;
                  if (isSelected) {
                    cellStyle = {
                      background: 'var(--accent)',
                      border: '1px solid var(--accent)',
                      borderRadius: 6,
                    };
                  } else if (isToday) {
                    cellStyle = {
                      background: 'var(--panel-2)',
                      border: '1px solid var(--accent)',
                      borderRadius: 6,
                    };
                  } else {
                    cellStyle = {
                      border: '1px solid transparent',
                      borderRadius: 6,
                    };
                  }

                  let dayNumColor;
                  if (!inMonth) {
                    dayNumColor = 'var(--text-faint)';
                  } else if (isPast && !isToday) {
                    dayNumColor = 'var(--text-faint)';
                  } else if (isSelected) {
                    dayNumColor = '#fff';
                  } else {
                    dayNumColor = 'var(--text)';
                  }

                  return (
                    <button
                      key={date}
                      onClick={() => setSelectedDay(isSelected ? null : date)}
                      className="py-1.5 px-0.5 text-center transition-colors"
                      style={cellStyle}
                    >
                      <div
                        className="text-xs font-medium mb-1"
                        style={{
                          color: dayNumColor,
                          opacity: !inMonth ? 0.35 : undefined,
                        }}
                      >
                        {parseInt(date.slice(8), 10)}
                      </div>
                      <div className="flex flex-wrap justify-center gap-0.5 min-h-[8px]">
                        {dayEvs.slice(0, 4).map((ev, i) => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor(ev) }} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div
          className="flex flex-wrap gap-4 mt-3 pt-3 text-xs"
          style={{
            borderTop: '1px solid var(--border)',
            color: 'var(--text-faint)',
          }}
        >
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: 'var(--info)' }} /> {t('earn_legend')}</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: 'var(--warn)' }} /> {t('div_macro_legend')}</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: 'var(--down)' }} /> {t('macro_high_legend')}</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: 'var(--text-faint)' }} /> {t('macro_low_legend')}</div>
        </div>
      </Card>

      {/* Event list */}
      <Card style={{ overflow: 'hidden', padding: 0 }}>
        <div
          className="px-5 py-3 flex flex-wrap items-center gap-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold mr-auto" style={{ color: 'var(--text)' }}>
            {selectedDay ? `${t('events_label')}: ${selectedDay}` : `${t('events_label')} — ${Array.isArray(MONTH_NAMES) ? MONTH_NAMES[currentMonth.getMonth()] : ''} ${currentMonth.getFullYear()}`}
          </h2>
          {/* Impact filter */}
          <div className="flex gap-1">
            {IMPACT_OPTS.map(opt => (
              <button
                key={opt}
                onClick={() => setFilterImpact(opt)}
                className={filterImpact === opt ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}
              >{opt}</button>
            ))}
          </div>
          {/* Country filter */}
          <div className="flex gap-1">
            {COUNTRY_OPTS.map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setFilterCountry(value)}
                className={filterCountry === value ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}
              >{label}</button>
            ))}
          </div>
        </div>

        {loading && listEvents.length === 0 ? (
          <div className="flex justify-center py-10"><Spinner size="md" /></div>
        ) : groupedList.length === 0 ? (
          <div className="px-5 py-8 text-center" style={{ color: 'var(--text-faint)' }}>
            <p>{t('no_events')}</p>
            {!symbols.length && <p className="text-xs mt-1">{t('add_to_portfolio_hint')}</p>}
          </div>
        ) : (
          <div>
            {groupedList.map(({ date, items }) => (
              <div key={date}>
                <div
                  className="px-5 py-2 text-xs font-semibold tracking-wide uppercase"
                  style={
                    date === today
                      ? { color: 'var(--info)', background: 'var(--panel-2)' }
                      : { color: 'var(--text-faint)', background: 'var(--bg)' }
                  }
                >
                  {date}{date === today ? ` — ${t('today')}` : ''}
                </div>
                {items.map((ev, i) => (
                  <div
                    key={i}
                    className="px-5 py-3 flex items-start gap-3 transition-colors"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    {ev.type === 'EARN' ? (
                      <>
                        <span className="text-lg leading-none mt-0.5">📊</span>
                        <div>
                          <span className="font-semibold" style={{ color: 'var(--text)' }}>{ev.symbol}</span>
                          <span className="text-xs ml-2" style={{ color: 'var(--text-dim)' }}>{t('financial_results')}</span>
                        </div>
                      </>
                    ) : ev.type === 'DIV' ? (
                      <>
                        <span className="text-lg leading-none mt-0.5">💰</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold" style={{ color: 'var(--text)' }}>{ev.symbol}</span>
                          <span className="text-xs ml-2" style={{ color: 'var(--text-dim)' }}>{t('ex_dividend')}</span>
                          {ev.amount != null && (
                            <span className="text-xs ml-2 font-medium" style={{ color: 'var(--warn)' }}>{Number(ev.amount).toFixed(2)} {ev.currency ?? ''}</span>
                          )}
                          {ev.projected && (
                            <span className="text-xs ml-2" style={{ color: 'var(--text-faint)' }}>{t('forecast_approx')}</span>
                          )}
                          {ev.isManual && (
                            <span className="text-xs ml-2" style={{ color: 'var(--text-faint)' }}>{t('manual_source')}</span>
                          )}
                        </div>
                        {ev.isManual && (
                          <button
                            onClick={() => deleteDividend(ev.id)}
                            style={{ fontSize: 16, lineHeight: 1, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}
                            title={t('delete_btn')}
                          >×</button>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="w-1 h-5 rounded-full shrink-0 mt-0.5" style={{ background: impactBar(ev.impact) }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm" style={{ color: 'var(--text)' }}>{ev.title}</div>
                          <div className="flex flex-wrap gap-2 text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                            {ev.currency && <span className="font-medium" style={{ color: 'var(--text-dim)' }}>{ev.currency}</span>}
                            {ev.time && <span>{ev.time}</span>}
                            {ev.forecast && <span>{t('forecast_colon')} <span style={{ color: 'var(--text)' }}>{ev.forecast}</span></span>}
                            {ev.previous && <span>{t('previous_colon')} <span style={{ color: 'var(--text-dim)' }}>{ev.previous}</span></span>}
                          </div>
                        </div>
                        {ev.actual ? (
                          <span className="font-semibold text-sm shrink-0" style={{ color: 'var(--text)' }}>{ev.actual}</span>
                        ) : null}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
