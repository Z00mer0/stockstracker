import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import useCalendarData from '../hooks/useCalendarData';
import Spinner from '../components/shared/Spinner';

const DAY_NAMES = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];

const MONTH_NAMES = [
  'Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
  'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień',
];

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
  if (ev.type === 'EARN') return 'bg-indigo-400';
  if (ev.type === 'DIV')  return 'bg-yellow-400';
  if (ev.impact === 'High') return 'bg-rose-500';
  if (ev.impact === 'Medium') return 'bg-yellow-400';
  return 'bg-slate-500';
}

function impactBar(impact) {
  if (impact === 'High')   return 'bg-rose-500';
  if (impact === 'Medium') return 'bg-yellow-400';
  return 'bg-slate-500';
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
  const { portfolio, loading: appLoading } = useApp();
  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);
  const { events, loading } = useCalendarData(symbols);
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
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        {/* Header: navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors text-lg"
            >‹</button>
            <h2 className="text-sm font-semibold text-slate-200 w-36 text-center">
              {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </h2>
            <button
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors text-lg"
            >›</button>
          </div>
          <div className="flex items-center gap-3">
            {loading && <Spinner size="sm" />}
            <button
              onClick={goToday}
              className="text-xs px-2.5 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              Dziś
            </button>
            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Pokaż wszystko ×
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: '320px' }}>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_NAMES.map(n => (
                <div key={n} className="text-center text-xs text-slate-500 py-0.5">{n}</div>
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
                  return (
                    <button
                      key={date}
                      onClick={() => setSelectedDay(isSelected ? null : date)}
                      className={`rounded-lg py-1.5 px-0.5 text-center transition-colors border ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-500'
                          : isToday
                          ? 'bg-slate-700/80 border-indigo-500/40'
                          : 'border-transparent hover:bg-slate-700/40'
                      }`}
                    >
                      <div className={`text-xs font-medium mb-1 ${
                        !inMonth
                          ? 'text-slate-600'
                          : isPast && !isToday
                          ? 'text-slate-500'
                          : isSelected
                          ? 'text-white'
                          : 'text-slate-300'
                      }`}>
                        {parseInt(date.slice(8), 10)}
                      </div>
                      <div className="flex flex-wrap justify-center gap-0.5 min-h-[8px]">
                        {dayEvs.slice(0, 4).map((ev, i) => (
                          <div key={i} className={`w-1.5 h-1.5 rounded-full ${dotColor(ev)}`} />
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
        <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-slate-700/60 text-xs text-slate-500">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-400" /> Wyniki spółek</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-400" /> Dywidenda / Makro średni</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500" /> Makro wysoki</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-500" /> Makro niski</div>
        </div>
      </div>

      {/* Event list */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-300 mr-auto">
            {selectedDay ? `Zdarzenia: ${selectedDay}` : `Zdarzenia — ${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`}
          </h2>
          {/* Impact filter */}
          <div className="flex gap-1">
            {IMPACT_OPTS.map(opt => (
              <button
                key={opt}
                onClick={() => setFilterImpact(opt)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  filterImpact === opt
                    ? 'bg-slate-600 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >{opt}</button>
            ))}
          </div>
          {/* Country filter */}
          <div className="flex gap-1">
            {COUNTRY_OPTS.map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setFilterCountry(value)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  filterCountry === value
                    ? 'bg-slate-600 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >{label}</button>
            ))}
          </div>
        </div>

        {loading && listEvents.length === 0 ? (
          <div className="flex justify-center py-10"><Spinner size="md" /></div>
        ) : groupedList.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500">
            <p>Brak zdarzeń w tym okresie</p>
            {!symbols.length && <p className="text-xs mt-1">Dodaj spółki do portfela, by zobaczyć wyniki finansowe i dywidendy</p>}
          </div>
        ) : (
          <div>
            {groupedList.map(({ date, items }) => (
              <div key={date}>
                <div className={`px-5 py-2 text-xs font-semibold tracking-wide uppercase ${
                  date === today ? 'text-indigo-400 bg-indigo-950/30' : 'text-slate-500 bg-slate-900/40'
                }`}>
                  {date}{date === today ? ' — dziś' : ''}
                </div>
                {items.map((ev, i) => (
                  <div key={i} className="px-5 py-3 flex items-start gap-3 border-t border-slate-700/40 hover:bg-slate-700/20 transition-colors">
                    {ev.type === 'EARN' ? (
                      <>
                        <span className="text-lg leading-none mt-0.5">📊</span>
                        <div>
                          <span className="text-slate-100 font-semibold">{ev.symbol}</span>
                          <span className="text-slate-400 text-xs ml-2">Wyniki finansowe</span>
                        </div>
                      </>
                    ) : ev.type === 'DIV' ? (
                      <>
                        <span className="text-lg leading-none mt-0.5">💰</span>
                        <div>
                          <span className="text-slate-100 font-semibold">{ev.symbol}</span>
                          <span className="text-slate-400 text-xs ml-2">Ex-dywidenda</span>
                          {ev.amount != null && (
                            <span className="text-yellow-400 text-xs ml-2 font-medium">${Number(ev.amount).toFixed(4)}</span>
                          )}
                          {ev.projected && (
                            <span className="text-slate-600 text-xs ml-2">~prognoza</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={`w-1 h-5 rounded-full shrink-0 mt-0.5 ${impactBar(ev.impact)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-slate-200 text-sm">{ev.title}</div>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-500 mt-0.5">
                            {ev.currency && <span className="font-medium text-slate-400">{ev.currency}</span>}
                            {ev.time && <span>{ev.time}</span>}
                            {ev.forecast && <span>Prognoza: <span className="text-slate-300">{ev.forecast}</span></span>}
                            {ev.previous && <span>Poprz.: <span className="text-slate-400">{ev.previous}</span></span>}
                          </div>
                        </div>
                        {ev.actual ? (
                          <span className="text-slate-100 font-semibold text-sm shrink-0">{ev.actual}</span>
                        ) : null}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
