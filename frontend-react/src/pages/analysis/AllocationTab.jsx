import { useMemo, useState } from 'react';
import { Download, Pencil, Save, Scale, CheckCircle2, PiggyBank } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usePrivacy } from '../../context/PrivacyContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import TickerLogo from '../../components/shared/TickerLogo';
import { Badge, Button, Card, Input, SegmentedControl, Table } from '../../components/ui';
import { cx } from '../../components/ui/cx.js';
import { lsSet } from '../../utils/safeStorage.js';
import { rebalanceOrders, allocateNewMoney } from '../../utils/rebalance.js';

const SECTOR_KEY_MAP = {
  'Technology': 'sector_Technology',
  'Financial Services': 'sector_FinancialServices',
  'Healthcare': 'sector_Healthcare',
  'Consumer Cyclical': 'sector_ConsumerCyclical',
  'Consumer Defensive': 'sector_ConsumerDefensive',
  'Industrials': 'sector_Industrials',
  'Basic Materials': 'sector_BasicMaterials',
  'Energy': 'sector_Energy',
  'Utilities': 'sector_Utilities',
  'Real Estate': 'sector_RealEstate',
  'Communication Services': 'sector_CommunicationServices',
  'Inne': 'sector_Other',
};

const SECTOR_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899',
  '#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16',
];

const REBAL_KEY = 'myfund_rebalance_targets';
function loadTargets() {
  try { return JSON.parse(localStorage.getItem(REBAL_KEY) || '{}'); } catch { return {}; }
}

function useDisplay() {
  const { locale } = useLanguage();
  const { displayCurrency, fxRates } = useApp();
  const dispFx = fxRates[displayCurrency] ?? 1;
  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const fmt = (n, d = 0) => (n == null || isNaN(n) ? '—' : n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d }));
  return { fmt, money: (pln, d = 0) => `${fmt(pln == null ? null : pln / dispFx, d)} ${currLabel}` };
}

function SectorCard({ positions, total }) {
  const t = useT();
  const { isPrivate } = usePrivacy();
  const { fmt, money } = useDisplay();
  const [view, setView] = useState('sector');

  const grouped = useMemo(() => {
    const map = {};
    for (const p of positions) {
      const key = view === 'sector' ? (p.sector || 'Inne') : (p.industry || p.sector || 'Inne');
      if (!map[key]) map[key] = { name: key, valuePLN: 0, plPLN: 0, positions: [] };
      map[key].valuePLN += p.valuePLN;
      map[key].plPLN += p.plPLN ?? 0;
      map[key].positions.push(p.symbol);
    }
    return Object.values(map)
      .sort((a, b) => b.valuePLN - a.valuePLN)
      .map((g, i) => ({ ...g, pct: total > 0 ? (g.valuePLN / total) * 100 : 0, color: SECTOR_COLORS[i % SECTOR_COLORS.length] }));
  }, [positions, view, total]);

  if (!positions.some(p => p.sector)) return null;
  const label = g => (SECTOR_KEY_MAP[g.name] ? t(SECTOR_KEY_MAP[g.name]) : g.name);
  const blur = isPrivate ? 'privacy-blur' : undefined;

  const columns = [
    {
      key: 'name', header: view === 'sector' ? t('sector_label') : t('industry_label'), mobile: 'title',
      render: g => <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: g.color }} />{label(g)}</span>,
    },
    { key: 'valuePLN', header: t('col_value_short'), align: 'right', sortable: true, firstDir: 'desc', render: g => <span className={cx('font-semibold', blur)}>{money(g.valuePLN)}</span> },
    { key: 'pct', header: t('col_share'), align: 'right', sortable: true, firstDir: 'desc', mobile: 'aside', render: g => `${fmt(g.pct, 1)}%` },
    {
      key: 'plPLN', header: t('gain_loss'), align: 'right', sortable: true, firstDir: 'desc',
      render: g => <span className={cx('font-semibold', g.plPLN >= 0 ? 'text-up' : 'text-down', blur)}>{g.plPLN >= 0 ? '+' : ''}{money(g.plPLN)}</span>,
    },
    { key: 'positions', header: t('col_companies'), render: g => <span className="text-[11px] text-faint">{g.positions.join(', ')}</span> },
  ];

  return (
    <Card
      title={t('sector_analysis')}
      actions={(
        <SegmentedControl
          options={[{ value: 'sector', label: t('sector_label') }, { value: 'industry', label: t('industry_label') }]}
          value={view}
          onChange={setView}
        />
      )}
    >
      <div className="grid gap-2 px-4 pb-4 pt-2">
        {grouped.map(g => (
          <div key={g.name}>
            <div className="mb-1 flex items-center justify-between text-small">
              <span className="text-dim">{label(g)}</span>
              <span className="font-semibold text-fg">{fmt(g.pct, 1)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
              <div className="h-full rounded-full transition-[width]" style={{ width: `${g.pct}%`, background: g.color }} />
            </div>
          </div>
        ))}
      </div>
      <Table columns={columns} rows={grouped} rowKey={g => g.name} />
    </Card>
  );
}

function CurrencyCard({ enriched, total }) {
  const t = useT();
  const { isPrivate } = usePrivacy();
  const { fmt, money } = useDisplay();
  const rows = Object.entries(enriched.reduce((acc, p) => {
    acc[p.currency] = (acc[p.currency] ?? 0) + (p.valuePLN ?? 0);
    return acc;
  }, {})).map(([currency, valuePLN]) => ({ currency, valuePLN, pct: total > 0 ? (valuePLN / total) * 100 : null }))
    .sort((a, b) => b.valuePLN - a.valuePLN);
  const blur = isPrivate ? 'privacy-blur' : undefined;
  return (
    <Card title={t('currency_alloc')}>
      <Table
        columns={[
          { key: 'currency', header: t('col_currency'), mobile: 'title', render: r => <span className="font-semibold text-fg">{r.currency}</span> },
          { key: 'valuePLN', header: t('col_value_short'), align: 'right', render: r => <span className={blur}>{money(r.valuePLN)}</span> },
          { key: 'pct', header: t('col_share'), align: 'right', mobile: 'aside', render: r => (r.pct != null ? `${fmt(r.pct, 1)}%` : '—') },
        ]}
        rows={rows}
        rowKey={r => r.currency}
      />
      <div className="flex justify-between border-t border-line px-4 py-2.5 text-small font-semibold text-fg">
        <span>{t('total_row')}</span>
        <span className={blur}>{money(total)} · 100%</span>
      </div>
    </Card>
  );
}

function ConcentrationCard({ enriched, total }) {
  const t = useT();
  const { isPrivate } = usePrivacy();
  const { fmt, money } = useDisplay();
  const rows = enriched
    .filter(p => p.valuePLN != null)
    .map(p => ({ ...p, pct: total > 0 ? (p.valuePLN / total) * 100 : null }))
    .sort((a, b) => b.valuePLN - a.valuePLN);
  return (
    <Card title={t('position_concentration')}>
      <Table
        columns={[
          { key: 'symbol', header: t('col_symbol'), mobile: 'title', render: p => <span className="flex items-center gap-2"><TickerLogo symbol={p.symbol} /><span className="font-semibold text-fg">{p.symbol}</span></span> },
          { key: 'valuePLN', header: t('col_value_short'), align: 'right', sortable: true, firstDir: 'desc', render: p => <span className={isPrivate ? 'privacy-blur' : undefined}>{money(p.valuePLN)}</span> },
          { key: 'pct', header: t('col_share'), align: 'right', sortable: true, firstDir: 'desc', mobile: 'aside', render: p => (p.pct != null ? `${fmt(p.pct, 1)}%` : '—') },
        ]}
        rows={rows}
        rowKey={p => p.id ?? p.symbol}
        defaultSort={{ key: 'valuePLN', dir: 'desc' }}
      />
    </Card>
  );
}

function RebalanceCard({ positions, total, targets, setTargets }) {
  const t = useT();
  const { fmt, money } = useDisplay();
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState({});

  const hasTargets = Object.keys(targets).length > 0;
  const targetSum = Object.values(targets).reduce((s, v) => s + (v || 0), 0);
  const sumOk = Math.abs(targetSum - 100) < 1;
  const orders = rebalanceOrders(positions, targets, total);

  function openEdit() {
    setDraft(Object.fromEntries(positions.map(p => [p.symbol, targets[p.symbol] ?? ''])));
    setEditMode(true);
  }
  function saveEdit() {
    const parsed = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, parseFloat(v) || 0]));
    setTargets(parsed);
    lsSet(REBAL_KEY, JSON.stringify(parsed));
    setEditMode(false);
  }
  function exportCsv() {
    const action = o => (o.side === 'buy' ? t('action_buy') : t('action_sell'));
    const header = `${t('col_symbol')},${t('col_action')},${t('col_amount_pln')},${t('col_shares_approx')},${t('col_price_per_share')}\n`;
    const rows = orders.map(o => `${o.symbol},${action(o)},${o.amtPLN.toFixed(2)},${o.shares ?? ''},${o.pricePLN?.toFixed(2) ?? ''}`).join('\n');
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'rebalance-orders.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card
      title={t('rebalance_section')}
      actions={(
        <Button size="sm" variant={editMode ? 'primary' : 'secondary'} icon={editMode ? Save : Pencil} onClick={editMode ? saveEdit : openEdit}>
          {editMode ? t('save_goals') : t('set_goals')}
        </Button>
      )}
    >
      <div className="grid gap-3 p-4">
        {hasTargets && (
          <p className={cx('text-small', sumOk ? 'text-up' : 'text-warn')}>
            {t('rebal_target_sum')}: {fmt(targetSum, 1)}%{!sumOk && ` ${t('rebal_should_be_100')}`}
          </p>
        )}
        {positions.map(p => {
          const curPct = total > 0 ? (p.valuePLN / total) * 100 : 0;
          const tgt = targets[p.symbol] ?? null;
          const dev = tgt != null ? curPct - tgt : null;
          const abs = dev != null ? Math.abs(dev) : 0;
          const devClass = dev == null ? 'text-faint' : abs < 2 ? 'text-up' : abs < 8 ? 'text-warn' : 'text-down';
          return (
            <div key={p.symbol} className="flex items-center gap-3">
              <span className="w-20 truncate text-[13px] font-semibold text-accent-text">{p.symbol}</span>
              <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-panel-2">
                <div className="h-full rounded bg-accent opacity-70 transition-[width]" style={{ width: `${Math.min(curPct, 100).toFixed(1)}%` }} />
                {tgt != null && tgt > 0 && <div className="absolute inset-y-0 w-0.5 bg-accent-text" style={{ left: `${Math.min(tgt, 100)}%` }} />}
              </div>
              <span className="w-12 text-right text-small text-fg">{fmt(curPct, 1)}%</span>
              {editMode ? (
                <input
                  type="number" min="0" max="100" step="1" placeholder="0"
                  aria-label={`${p.symbol} — ${t('set_goals')}`}
                  value={draft[p.symbol] ?? ''}
                  onChange={e => setDraft(prev => ({ ...prev, [p.symbol]: e.target.value }))}
                  className="w-16 rounded-card-sm border border-line bg-bg px-2 py-0.5 text-right text-small text-fg outline-none focus:border-accent"
                />
              ) : (
                <span className={cx('w-16 text-right text-small', devClass)}>
                  {tgt != null
                    ? (dev != null && abs >= 0.05 ? `${dev > 0 ? '▲ +' : '▼ '}${fmt(dev, 1)}%` : '✓')
                    : <span className="text-faint">{fmt(0, 0)}%</span>}
                </span>
              )}
            </div>
          );
        })}

        {orders.length > 0 && (
          <div className="mt-1 border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-label font-semibold uppercase text-dim">{t('rebal_orders_title')}</p>
              <Button size="sm" icon={Download} onClick={exportCsv}>{t('rebal_download_csv')}</Button>
            </div>
            <Table
              columns={[
                { key: 'symbol', header: t('col_symbol'), mobile: 'title', render: o => <span className="font-semibold text-fg">{o.symbol}</span> },
                { key: 'side', header: t('col_action'), mobile: 'aside', render: o => <Badge tone={o.side === 'buy' ? 'up' : 'down'}>{o.side === 'buy' ? t('action_buy') : t('action_sell')}</Badge> },
                { key: 'amtPLN', header: t('col_amount_pln'), align: 'right', render: o => money(o.amtPLN) },
                { key: 'shares', header: t('col_shares_approx'), align: 'right', render: o => o.shares ?? '—' },
                { key: 'pricePLN', header: t('col_price_per_share'), align: 'right', render: o => (o.pricePLN != null ? money(o.pricePLN, 2) : '—') },
              ]}
              rows={orders}
              rowKey={o => o.symbol}
            />
          </div>
        )}

        {hasTargets && orders.length === 0 && sumOk && (
          <p className="flex items-center gap-2 text-small text-up"><CheckCircle2 size={15} aria-hidden />{t('rebal_balanced')}</p>
        )}
        {!hasTargets && <p className="flex items-center gap-2 text-small text-faint"><Scale size={15} aria-hidden />{t('rebal_hint')}</p>}
      </div>
    </Card>
  );
}

// „Gdzie wpłacić kolejne pieniądze?" — tylko zakupy, w stronę celów z karty
// rebalansowania (bez sprzedaży, więc bez podatku).
function NewMoneyCard({ positions, total, targets }) {
  const t = useT();
  const { fmt, money } = useDisplay();
  const [amount, setAmount] = useState('1000');
  const sumOk = Math.abs(Object.values(targets).reduce((s, v) => s + (v || 0), 0) - 100) < 1;
  const value = parseFloat(String(amount).replace(',', '.')) || 0;
  const { orders, leftover } = allocateNewMoney(positions, targets, total, value);

  return (
    <Card title={t('newmoney_title')}>
      <div className="grid gap-3 p-4">
        <p className="text-small text-dim">{t('newmoney_desc')}</p>
        <label className="flex items-center gap-3 text-small text-dim">
          {t('newmoney_amount')}
          <Input type="number" min="0" step="100" inputMode="decimal" suffix="zł" value={amount} onChange={e => setAmount(e.target.value)} className="w-40" />
        </label>
        {!sumOk ? (
          <p className="flex items-center gap-2 text-small text-faint"><Scale size={15} aria-hidden />{t('newmoney_need_targets')}</p>
        ) : orders.length === 0 ? (
          value > 0 && <p className="text-small text-faint">{t('newmoney_too_small')}</p>
        ) : (
          <>
            <Table
              columns={[
                { key: 'symbol', header: t('col_symbol'), mobile: 'title', render: o => <span className="font-semibold text-fg">{o.symbol}</span> },
                { key: 'shares', header: t('newmoney_shares'), align: 'right', mobile: 'aside', render: o => (o.shares > 0 ? <Badge tone="up">{`+${o.shares}`}</Badge> : <span className="text-faint">—</span>) },
                { key: 'cost', header: t('col_amount_pln'), align: 'right', render: o => money(o.cost) },
                { key: 'pricePLN', header: t('col_price_per_share'), align: 'right', render: o => money(o.pricePLN, 2) },
                { key: 'afterPct', header: t('newmoney_after'), align: 'right', render: o => `${fmt(o.afterPct, 1)}%` },
              ]}
              rows={orders}
              rowKey={o => o.symbol}
            />
            <p className="flex items-center gap-2 text-small text-dim">
              <PiggyBank size={15} aria-hidden />
              {t('newmoney_leftover').replace('{amount}', money(leftover))}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

export default function AllocationTab({ enriched, totalValue }) {
  const positions = enriched.filter(p => p.valuePLN != null && p.valuePLN > 0);
  const total = totalValue || positions.reduce((s, p) => s + p.valuePLN, 0);
  const [targets, setTargets] = useState(loadTargets); // wspólne dla rebalansowania i nowych wpłat
  return (
    <div className="space-y-4">
      {positions.length > 0 && <SectorCard positions={positions} total={total} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <ConcentrationCard enriched={enriched} total={totalValue} />
        <CurrencyCard enriched={enriched} total={totalValue} />
      </div>
      <RebalanceCard positions={positions} total={total} targets={targets} setTargets={setTargets} />
      <NewMoneyCard positions={positions} total={total} targets={targets} />
    </div>
  );
}
