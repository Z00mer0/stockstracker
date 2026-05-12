import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import useCalendarData from '../hooks/useCalendarData';
import Spinner from '../components/shared/Spinner';

const DAY_NAMES = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];

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
  if (ev.impact === 'High') return 'bg-rose-500';
  if (ev.impact === 'Medium') return 'bg-yellow-400';
  return 'bg-slate-500';
}

function impactBar(impact) {
  if (impact === 'High')   return 'bg-rose-500';
  if (impact === 'Medium') return 'bg-yellow-400';
  return 'bg-slate-500';
}

export default function Calendar() {
  const { portfolio, loading: appLoading } = useApp();
  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);
  const { events, loading } = useCalendarData(symbols);
  const [selectedDay, setSelectedDay] = useState(null);

  const today = toISO(new Date());
  const monday = getMonday(new Date());

  const weeks = useMemo(() => [0, 1].map(w =>
    Array.from({ length: 7 }, (_, d) => toISO(addDays(monday, w * 7 + d)))
  ), [toISO(monday)]);

  const byDate = useMemo(() => {
    const map = {};
    for (const ev of events) {
      (map[ev.date] ??= []).push(ev);
    }
    return map;
  }, [events]);

  const minDate = weeks[0][0];
  const maxDate = weeks[1][6];

  const listEvents = useMemo(() =>
    selectedDay
      ? events.filter(e => e.date === selectedDay)
      : events.filter(e => e.date >= minDate && e.date <= maxDate),
    [events, selectedDay, minDate, maxDate]
  );

  // Group list events by date for rendering
  const groupedList = useMemo(() => {
    const groups = [];
    let lastDate = null;
    for (const ev of listEvents) {
      if (ev.date !== lastDate) { groups.push({ date: ev.date, items: [] }); lastDate = ev.date; }
      groups[groups.length - 1].items.push(ev);
    }
    return groups;
  }, [listEvents]);

  if (appLoading && !portfolio.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Week grid */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300">Kalendarz zdarzeń</h2>
          <div className="flex items-center gap-3">
            {loading && <Spinner size="sm" />}
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
          <div style={{ minWidth: '480px' }}>
            {/* Day name headers */}
            <div className="grid grid-cols-7 gap-1.5 mb-1">
              {DAY_NAMES.map(n => (
                <div key={n} className="text-center text-xs text-slate-500 py-0.5">{n}</div>
              ))}
            </div>

            {/* Two week rows */}
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1.5 mb-1.5">
                {week.map(date => {
                  const dayEvs = byDate[date] ?? [];
                  const isToday    = date === today;
                  const isSelected = date === selectedDay;
                  const isPast     = date < today;
                  return (
                    <button
                      key={date}
                      onClick={() => setSelectedDay(isSelected ? null : date)}
                      className={`rounded-lg py-1.5 px-1 text-center transition-colors border ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-500'
                          : isToday
                          ? 'bg-slate-700/80 border-indigo-500/40'
                          : 'border-transparent hover:bg-slate-700/40'
                      }`}
                    >
                      <div className={`text-xs font-medium mb-1 ${
                        isPast && !isToday ? 'text-slate-500' : isSelected ? 'text-white' : 'text-slate-300'
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
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500" /> Makro wysoki</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-400" /> Makro średni</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-500" /> Makro niski</div>
        </div>
      </div>

      {/* Event list */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300">
            {selectedDay ? `Zdarzenia: ${selectedDay}` : 'Zdarzenia — bieżący i następny tydzień'}
          </h2>
        </div>

        {loading && listEvents.length === 0 ? (
          <div className="flex justify-center py-10"><Spinner size="md" /></div>
        ) : groupedList.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500">
            <p>Brak zdarzeń w tym okresie</p>
            {!symbols.length && <p className="text-xs mt-1">Dodaj spółki do portfela, by zobaczyć wyniki finansowe</p>}
          </div>
        ) : (
          <div>
            {groupedList.map(({ date, items }) => (
              <div key={date}>
                {/* Date separator */}
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
