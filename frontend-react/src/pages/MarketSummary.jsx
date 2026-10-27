import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, CalendarDays, CircleDot, PieChart, Activity, RefreshCw } from 'lucide-react';
import { api } from '../hooks/useApi';
import { useLanguage, useT } from '../context/LanguageContext';
import { formatPercent } from '../utils/format.js';
import Sparkline from '../components/shared/Sparkline';
import { Badge, Button, EmptyState, SegmentedControl, Skeleton } from '../components/ui';
import { cx } from '../components/ui/cx.js';

// Podsumowanie ostatniej sesji GPW / USA (GET /api/market-summary, liczone
// na serwerze — market_summary.py). Ta sama strona otwiera się z pusha
// wysyłanego po zamknięciu sesji.
const CUR = { PLN: 'zł', USD: '$' };

function tone(v) {
  return v == null ? 'text-faint' : v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-dim';
}

function IndexCard({ idx, locale }) {
  return (
    <div className="card flex min-w-0 flex-col gap-1 p-4">
      <span className="text-[13px] font-semibold text-dim">{idx.name}</span>
      <span className="text-xl font-bold tabular-nums text-fg">
        {idx.value == null ? '—' : idx.value.toLocaleString(locale, { maximumFractionDigits: 0 })}
      </span>
      <div className="mt-auto flex items-end justify-between gap-2">
        <span className={cx('text-small font-semibold tabular-nums', tone(idx.changePct))}>{formatPercent(idx.changePct, { locale })}</span>
        <div className="w-20 shrink-0"><Sparkline data={idx.spark ?? []} height={28} fluid /></div>
      </div>
    </div>
  );
}

function MoverList({ title, icon: Icon, accent, items, locale }) {
  return (
    <div className="card min-w-0 overflow-hidden">
      <div className={cx('flex items-center gap-2 border-b border-line px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider', accent)}>
        <Icon size={14} aria-hidden /> {title}
      </div>
      {items.length === 0
        ? <div className="px-4 py-3 text-small text-faint">—</div>
        : items.map(m => (
          <div key={m.symbol} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
            <div className="min-w-0">
              <div className="font-semibold text-fg">{m.symbol}</div>
              <div className="truncate text-[11px] uppercase text-faint">{m.name}</div>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <div className="font-semibold text-fg">{m.price.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: m.price < 10 ? 3 : 2 })}</div>
              <div className={cx('text-[12px] font-semibold', tone(m.changePct))}>{formatPercent(m.changePct, { locale })}</div>
            </div>
          </div>
        ))}
    </div>
  );
}

export default function MarketSummary() {
  const t = useT();
  const { locale } = useLanguage();
  const navigate = useNavigate();
  const { market: param } = useParams();
  const market = param === 'us' ? 'us' : 'gpw';
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(false);
    api.get(`/api/market-summary?market=${market}`)
      .then(r => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [market, reload]);

  const compact = v => (v == null ? '—' : new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 }).format(v));
  const head = data?.indices.find(i => i.name === data.headline);
  const b = data?.breadth;
  const share = n => (b?.total ? formatPercent(n / b.total * 100, { locale, decimals: 1, showSign: false }) : '—');

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label={t('mkt_market')}
          options={[{ value: 'gpw', label: '🇵🇱 GPW' }, { value: 'us', label: '🇺🇸 USA' }]}
          value={market}
          onChange={m => navigate(`/market/${m}`)}
        />
        {data && (
          <div className="flex items-center gap-2 text-small text-dim">
            <CalendarDays size={15} aria-hidden />
            {new Date(`${data.date}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
            <Badge tone={data.closed ? 'neutral' : 'up'}>{data.closed ? t('mkt_closed') : t('mkt_live')}</Badge>
          </div>
        )}
      </div>

      {error && (
        <EmptyState
          icon={Activity}
          title={t('mkt_error')}
          action={<Button icon={RefreshCw} onClick={() => setReload(r => r + 1)}>{t('refresh_data')}</Button>}
        />
      )}

      {!data && !error && (
        <div className="grid gap-4" aria-busy="true">
          <Skeleton className="h-20" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}</div>
          <Skeleton className="h-24" />
        </div>
      )}

      {data && (
        <>
          {head && (
            <div
              className="card flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4"
              style={{ backgroundImage: `linear-gradient(90deg, var(${head.changePct >= 0 ? '--up-soft' : '--down-soft'}), transparent)` }}
            >
              <span className="text-lg font-bold text-fg">{head.name}</span>
              <span className="text-3xl font-bold tabular-nums text-fg">
                {head.value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={cx('text-xl font-bold tabular-nums', tone(head.changePct))}>{formatPercent(head.changePct, { locale })}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.indices.map(i => <IndexCard key={i.name} idx={i} locale={locale} />)}
          </div>

          <section className="card grid gap-3 p-4" aria-label={t('mkt_breadth')}>
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-dim">{t('mkt_breadth')}</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { n: b.up, label: t('mkt_up'), icon: ArrowUp, cls: 'text-up' },
                { n: b.down, label: t('mkt_down'), icon: ArrowDown, cls: 'text-down' },
                { n: b.flat, label: t('mkt_flat'), icon: ArrowRight, cls: 'text-dim' },
              ].map(({ n, label, icon: Icon, cls }) => (
                <div key={label} className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <Icon size={16} className={cx('self-center', cls)} aria-hidden />
                    <span className="text-xl font-bold tabular-nums text-fg">{n}</span>
                    <span className="text-[11px] uppercase text-dim">{label}</span>
                  </div>
                  <div className={cx('text-small font-semibold tabular-nums', cls)}>{share(n)}</div>
                </div>
              ))}
            </div>
            {b.total > 0 && (
              <div className="flex h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                <span className="bg-up" style={{ width: `${b.up / b.total * 100}%` }} />
                <span className="bg-faint" style={{ width: `${b.flat / b.total * 100}%` }} />
                <span className="bg-down" style={{ width: `${b.down / b.total * 100}%` }} />
              </div>
            )}
          </section>

          <div className="grid grid-cols-2 gap-3">
            <div className="card flex items-center gap-3 p-4">
              <BarChart3 size={22} className="shrink-0 text-dim" aria-hidden />
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-dim">{t('mkt_turnover')}</div>
                <div className="text-base font-bold tabular-nums text-fg sm:text-lg">{compact(data.turnover)} {CUR[data.currency] ?? data.currency}</div>
              </div>
            </div>
            <div className="card flex items-center gap-3 p-4">
              <PieChart size={22} className="shrink-0 text-dim" aria-hidden />
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-dim">{t('mkt_volume')}</div>
                <div className="text-base font-bold tabular-nums text-fg sm:text-lg">{compact(data.volume)} {t('mkt_shares')}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <MoverList title={t('mkt_gainers')} icon={ArrowUp} accent="text-up" items={data.gainers} locale={locale} />
            <MoverList title={t('mkt_losers')} icon={ArrowDown} accent="text-down" items={data.losers} locale={locale} />
            <MoverList title={t('mkt_active')} icon={CircleDot} accent="text-dim" items={data.active} locale={locale} />
          </div>

          <p className="text-[11px] leading-relaxed text-faint">
            {t('mkt_note')
              .replace('{n}', data.universe.priced)
              .replace('{size}', data.universe.size)
              .replace('{label}', data.universe.label)
              .replace('{time}', new Date(data.asOf * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }))}
          </p>
        </>
      )}
    </div>
  );
}
