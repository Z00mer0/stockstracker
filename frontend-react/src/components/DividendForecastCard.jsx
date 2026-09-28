import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarCheck, Coins, Wallet } from 'lucide-react';
import { useLanguage, useT } from '../context/LanguageContext';
import { usePrivacy } from '../context/PrivacyContext';
import { Card, Spinner, Stat } from './ui';
import { axisProps, gridProps, tooltipProps } from './charts/theme.js';

// Prognoza dywidend na 12 miesięcy — liczy utils/dividendForecast.js.
export default function DividendForecastCard({ forecast, isNet, dispFx, currency, loading }) {
  const t = useT();
  const { locale } = useLanguage();
  const { isPrivate } = usePrivacy();
  const money = (v, d = 0) => `${(v / dispFx).toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d })} ${currency}`;
  const monthName = ym => new Date(`${ym}-01T00:00:00`).toLocaleDateString(locale, { month: 'short' });
  const key = isNet ? 'net' : 'gross';
  const data = forecast.months.map(m => ({ ym: m.ym, label: monthName(m.ym), value: m[key] / dispFx, items: m.items }));
  const empty = forecast.gross <= 0;

  return (
    <Card title={t('divfc_title')} actions={loading && <Spinner size="sm" label={t('loading')} />}>
      <div className="grid gap-3 px-4 pb-4 pt-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat blur={isPrivate} icon={Coins} label={t('divfc_total')} value={money(forecast.gross)} hint={`${t('net')}: ${money(forecast.net)}`} />
          <Stat blur={isPrivate} icon={Wallet} label={t('divfc_monthly_net')} value={money(forecast.net / 12)} />
          <Stat
            blur={isPrivate} icon={CalendarCheck} label={t('divfc_next')}
            value={forecast.next ? forecast.next.symbol.replace(/\.WA$/, '') : '—'}
            hint={forecast.next ? `${forecast.next.date} · ${money(forecast.next[key], 2)}${forecast.next.announced ? '' : ` · ${t('divfc_estimated')}`}` : undefined}
          />
        </div>
        {empty ? (
          <p className="text-small text-faint">{loading ? t('loading') : t('divfc_empty')}</p>
        ) : (
          <div className={isPrivate ? 'privacy-blur' : undefined} role="img" aria-label={t('divfc_title')}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval={0} />
                <YAxis {...axisProps} width={48} tickFormatter={v => Math.round(v).toLocaleString(locale)} />
                <Tooltip
                  {...tooltipProps}
                  cursor={{ fill: 'var(--panel-2)' }}
                  formatter={v => [money(v * dispFx, 2), isNet ? t('net') : t('gross')]}
                  labelFormatter={(_, p) => {
                    const row = p?.[0]?.payload;
                    return row ? `${row.ym} · ${row.items.map(i => i.symbol.replace(/\.WA$/, '')).join(', ')}` : '';
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} style={{ fill: 'var(--warn)' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-faint">{t('divfc_note')}</p>
      </div>
    </Card>
  );
}
