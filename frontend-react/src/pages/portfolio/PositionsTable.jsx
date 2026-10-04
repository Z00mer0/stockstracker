import { Fragment, useMemo, useState } from 'react';
import {
  ListFilter, Download, Upload, Plus, ChevronDown, Ellipsis, ArrowUp, ArrowDown, ArrowUpDown,
  ArrowDownRight, Pencil, Coins, Eye, EyeOff, ChartColumn, Bell, StickyNote, Trash2,
  TriangleAlert, Check, X, TrendingUp, Bitcoin, FileSpreadsheet, FileText,
} from 'lucide-react';
import { useLanguage, useT } from '../../context/LanguageContext';
import { usePrivacy } from '../../context/PrivacyContext';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import TickerLogo from '../../components/shared/TickerLogo';
import ColumnPicker from '../../components/shared/ColumnPicker';
import { getColLabel, loadColumnConfig, saveColumnConfig, SORT_GETTERS, PRIVATE_COLS } from '../../utils/portfolioColumns';
import { Button, Card, IconButton, Menu, Select, Spinner } from '../../components/ui';
import { cx } from '../../components/ui/cx.js';
import { fmt, renderCell } from './positionCells.jsx';
import { isWatched } from './watchlistLocal.js';

// Tabela pozycji z paskiem narzędzi (filtry, eksport/import, „+ Dodaj",
// wybór kolumn). Na komputerze — tabela z sortowaniem po nagłówku
// i przeciąganiem kolumn; na telefonie — lista kart, bo 8 kolumn na 390 px
// dawało przewijanie w bok z przyklejonym symbolem.

const SECTOR_OTHER = 'Inne';
const SECTOR_COLORS = {
  Technology: '#7c9eff', Tech: '#7c9eff',
  Gaming: '#a78bfa', Energy: '#ffb020',
  'Consumer Cyclical': '#34d399', Retail: '#34d399',
  'Consumer Defensive': '#34d399',
  Auto: '#ff4d6d', Automotive: '#ff4d6d',
  Finance: '#22d3ee', Financials: '#22d3ee', 'Financial Services': '#22d3ee',
  Healthcare: '#f472b6', Health: '#f472b6',
  'Basic Materials': '#fb923c', Construction: '#fb923c',
  Food: '#facc15', 'Consumer Staples': '#facc15',
  Communication: '#60a5fa', 'Communication Services': '#60a5fa',
  Utilities: '#a3e635', 'Real Estate': '#f87171',
  Industrials: '#fbbf24', [SECTOR_OTHER]: '#8a929d',
};

function NoteEditor({ symbol, initial, onSave, onCancel }) {
  const t = useT();
  const [draft, setDraft] = useState(initial);
  return (
    <div className="bg-panel-2 px-4 pb-3 pt-2">
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder={t('pf_note_ph').replace('{symbol}', symbol)}
        aria-label={t('pf_note_ph').replace('{symbol}', symbol)}
        className="min-h-[80px] w-full resize-y rounded-card-sm border border-line bg-bg px-2.5 py-1.5 text-xs text-fg outline-none focus:border-accent"
      />
      <div className="mt-1.5 flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => { setDraft(initial); onCancel(); }}>{t('cancel')}</Button>
        <Button size="sm" variant="primary" onClick={() => onSave(draft)}>{t('save_btn')}</Button>
      </div>
    </div>
  );
}

export default function PositionsTable({
  positions, positionsValuePLN, notes, onSaveNote, alertsPerSymbol, metricsLoading,
  fxRates, divBySymbol, displayCurrency, portToDisp, portCurrLabel,
  onOpen, onRenameTicker, onAction, onExport, onImport, onAdd, alertDisabled,
}) {
  const t = useT();
  const { locale } = useLanguage();
  const { isPrivate } = usePrivacy();
  const isMobile = useIsMobile();

  const [sortCol, setSortCol] = useState('costPLN');
  const [sortDir, setSortDir] = useState('desc');
  const [dragCol, setDragCol] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [filterChip, setFilterChip] = useState('all');
  const [filterGpw, setFilterGpw] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [cols, setCols] = useState(loadColumnConfig);
  const [noteEditing, setNoteEditing] = useState(null);
  const [editTicker, setEditTicker] = useState(null); // { oldSymbol, value }

  function handleColChange(newCols) {
    setCols(newCols);
    saveColumnConfig(newCols);
  }

  function handleSort(key) {
    if (sortCol === key) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortCol(key); setSortDir('desc'); }
  }

  function handleColDrop(targetKey) {
    if (!dragCol || dragCol === targetKey) return;
    const from = cols.indexOf(dragCol);
    const to = cols.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    const next = [...cols];
    next.splice(from, 1);
    next.splice(to, 0, dragCol);
    handleColChange(next);
  }

  const sorted = useMemo(() => [...positions].sort((a, b) => {
    if (sortCol === 'symbol') {
      const cmp = a.symbol.localeCompare(b.symbol);
      return sortDir === 'asc' ? cmp : -cmp;
    }
    const getter = SORT_GETTERS[sortCol];
    if (!getter) return 0;
    const va = getter(a), vb = getter(b);
    return sortDir === 'asc' ? va - vb : vb - va;
  }), [positions, sortCol, sortDir]);

  const filteredSorted = useMemo(() => {
    let base = sorted;
    if (filterChip === 'win') base = base.filter(p => (p.plPLN ?? 0) >= 0);
    if (filterChip === 'lose') base = base.filter(p => (p.plPLN ?? 0) < 0);
    if (filterGpw) base = base.filter(p => p.symbol?.endsWith('.WA'));
    return base;
  }, [sorted, filterChip, filterGpw]);

  // Udział wg wartości rynkowej — tak samo jak wykres „Skład portfela" obok.
  // Wcześniej wg kosztu zakupu, więc tabela i wykres pokazywały inne procenty
  // (demo: PKO 23,2% w tabeli, 7,1% na wykresie). Pozycja bez notowania
  // liczy się po koszcie, jak w nagłówku portfela.
  const worth = p => p.valuePLN ?? p.costPLN ?? 0;
  const filteredValuePLN = filteredSorted.reduce((sum, p) => sum + worth(p), 0);

  const groupedPositions = useMemo(() => {
    if (!grouped) return null;
    const bySector = {};
    filteredSorted.forEach(p => {
      const sec = p.sector || SECTOR_OTHER;
      (bySector[sec] = bySector[sec] || []).push(p);
    });
    return Object.entries(bySector).sort((a, b) =>
      b[1].reduce((s, p) => s + (p.valuePLN ?? 0), 0) - a[1].reduce((s, p) => s + (p.valuePLN ?? 0), 0));
  }, [filteredSorted, grouped]);

  const shareOf = pos => (filteredValuePLN > 0 ? (worth(pos) / filteredValuePLN) * 100 : 0);
  const sectorLabel = sec => (sec === SECTOR_OTHER ? t('pf_sector_other') : sec);

  // ── Menu ⋯ przy pozycji ──
  const rowMenuItems = pos => {
    const watched = isWatched(pos.symbol);
    return [
      { icon: Plus, label: t('buy_more'), onSelect: () => onAction('buy', pos) },
      { icon: ArrowDownRight, label: t('pf_sell'), onSelect: () => onAction('sell', pos) },
      { icon: Pencil, label: t('edit_position'), onSelect: () => onAction('edit', pos) },
      { icon: Coins, label: t('pf_dividend'), onSelect: () => onAction('dividend', pos) },
      { icon: watched ? EyeOff : Eye, label: watched ? t('unwatch') : t('watch'), onSelect: () => onAction('watch', pos) },
      { icon: ChartColumn, label: t('pf_fundamentals'), onSelect: () => onOpen(pos) },
      { icon: Bell, label: t('pf_set_alert'), onSelect: () => onAction('alert', pos), disabled: alertDisabled, title: alertDisabled ? t('pf_alert_migrating') : undefined },
      { separator: true },
      { icon: StickyNote, label: t('pf_note'), onSelect: () => setNoteEditing(n => (n === pos.symbol ? null : pos.symbol)) },
      { icon: Trash2, label: t('delete_position'), danger: true, onSelect: () => onAction('delete', pos) },
    ];
  };
  const rowMenu = pos => (
    <Menu
      align="right"
      width={196}
      label={t('pf_row_actions').replace('{symbol}', pos.symbol)}
      items={rowMenuItems(pos)}
      trigger={<IconButton icon={Ellipsis} size="sm" label={t('pf_row_actions').replace('{symbol}', pos.symbol)} />}
    />
  );

  // ── Symbol z ikonami: notatka, alerty, brak notowań (zmiana tickera) ──
  function symbolBadges(pos) {
    return (
      <>
        {notes[pos.symbol]?.text && <StickyNote size={12} aria-label={t('pf_note')} className="shrink-0 text-faint" />}
        {alertsPerSymbol.has(pos.symbol) && (
          <Bell size={12} className="shrink-0 text-faint" aria-label={t('pf_alerts_active').replace('{n}', alertsPerSymbol.get(pos.symbol))}>
            <title>{t('pf_alerts_active').replace('{n}', alertsPerSymbol.get(pos.symbol))}</title>
          </Bell>
        )}
        {pos.notFound && (editTicker?.oldSymbol === pos.symbol ? (
          <form
            onSubmit={e => { e.preventDefault(); e.stopPropagation(); onRenameTicker(pos.symbol, editTicker.value).then(() => setEditTicker(null)); }}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1"
          >
            <input
              autoFocus
              aria-label={t('pf_rename_ticker')}
              value={editTicker.value}
              onChange={e => setEditTicker(tk => ({ ...tk, value: e.target.value.toUpperCase() }))}
              onKeyDown={e => e.key === 'Escape' && setEditTicker(null)}
              className="w-24 rounded-md border border-accent bg-panel-2 px-1.5 py-0.5 text-xs text-fg outline-none"
            />
            <IconButton icon={Check} size="sm" type="submit" label={t('save_btn')} className="h-6 w-6" />
            <IconButton icon={X} size="sm" label={t('cancel')} className="h-6 w-6" onClick={() => setEditTicker(null)} />
          </form>
        ) : (
          <button
            type="button"
            title={t('quote_not_found')}
            aria-label={t('quote_not_found')}
            onClick={e => { e.stopPropagation(); setEditTicker({ oldSymbol: pos.symbol, value: pos.symbol }); }}
            className="shrink-0 text-down hover:brightness-125"
          >
            <TriangleAlert size={13} aria-hidden />
          </button>
        ))}
      </>
    );
  }

  const noteEditor = pos => (
    <NoteEditor
      symbol={pos.symbol}
      initial={notes[pos.symbol]?.text || ''}
      onSave={text => { onSaveNote(pos.symbol, text); setNoteEditing(null); }}
      onCancel={() => setNoteEditing(null)}
    />
  );

  // ── Pasek narzędzi ──
  const activeCount = (filterChip !== 'all' ? 1 : 0) + (filterGpw ? 1 : 0) + (grouped ? 1 : 0);
  const filterItems = [
    { heading: t('filter_pl_label') },
    ...[['all', t('filter_all'), null], ['win', t('filter_winners'), 'var(--up)'], ['lose', t('filter_losers'), 'var(--down)']]
      .map(([id, label, swatch]) => ({ label, swatch, checked: filterChip === id, keepOpen: true, onSelect: () => setFilterChip(id) })),
    { separator: true },
    { heading: t('exchange') },
    { label: t('pf_only_gpw'), checked: filterGpw, keepOpen: true, onSelect: () => setFilterGpw(v => !v) },
    { separator: true },
    { heading: t('pf_view') },
    { label: t('group_sectors'), checked: grouped, keepOpen: true, onSelect: () => setGrouped(v => !v) },
    ...(activeCount > 0 ? [
      { separator: true },
      { icon: X, label: t('clear_filters'), onSelect: () => { setFilterChip('all'); setFilterGpw(false); setGrouped(false); } },
    ] : []),
  ];
  const exportItems = [
    { heading: t('export') },
    { icon: FileText, label: t('pf_exp_positions'), hint: 'CSV', onSelect: () => onExport('positions', 'csv', sorted) },
    { icon: FileSpreadsheet, label: t('pf_exp_positions'), hint: 'Excel', onSelect: () => onExport('positions', 'xlsx', sorted) },
    { icon: FileText, label: t('pf_exp_transactions'), hint: 'CSV', onSelect: () => onExport('transactions', 'csv') },
    { icon: FileSpreadsheet, label: t('pf_exp_transactions'), hint: 'Excel', onSelect: () => onExport('transactions', 'xlsx') },
    { icon: FileText, label: t('pf_exp_history'), hint: 'CSV', onSelect: () => onExport('history', 'csv') },
    { icon: FileSpreadsheet, label: t('pf_exp_history'), hint: 'Excel', onSelect: () => onExport('history', 'xlsx') },
    { separator: true },
    { heading: t('import_btn') },
    { icon: Upload, label: t('pf_import_file'), onSelect: onImport },
  ];
  const addItems = [
    { icon: TrendingUp, label: t('pf_add_stocks'), onSelect: () => onAdd('stock') },
    { icon: Bitcoin, label: t('pf_add_crypto'), onSelect: () => onAdd('crypto') },
  ];
  const sortOptions = [['symbol', t('col_symbol')], ...cols.filter(k => SORT_GETTERS[k]).map(k => [k, getColLabel(k, t)])];

  const toolbar = (
    <div className="card-head gap-2">
      <Menu
        label={t('filter')}
        items={filterItems}
        trigger={
          <Button size="sm" variant={activeCount > 0 ? 'primary' : 'secondary'} icon={ListFilter}>
            {t('filter')}
            {activeCount > 0 && <span className="rounded-full bg-white/25 px-1.5 text-[10px] leading-4">{activeCount}</span>}
          </Button>
        }
      />
      {isMobile && (
        <div className="flex items-center gap-1">
          <Select aria-label={t('pf_sort_by')} value={sortCol} onChange={e => setSortCol(e.target.value)} className="w-36">
            {sortOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
          <IconButton
            icon={sortDir === 'asc' ? ArrowUp : ArrowDown}
            size="sm"
            label={`${t('pf_sort_by')}: ${sortDir === 'asc' ? '↑' : '↓'}`}
            onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
          />
        </div>
      )}
      <div className="flex-1" />
      {metricsLoading && <Spinner size="sm" label={t('loading_prices')} />}
      <Menu
        align="right"
        width={232}
        label={t('export')}
        items={exportItems}
        trigger={
          <Button size="sm" icon={Download}>
            {isMobile ? t('export') : `${t('export')} / ${t('import_btn')}`}
            <ChevronDown size={13} aria-hidden />
          </Button>
        }
      />
      <Menu
        align="right"
        width={184}
        label={t('add')}
        items={addItems}
        trigger={<Button size="sm" variant="primary" icon={Plus}>{t('add')}<ChevronDown size={13} aria-hidden /></Button>}
      />
      <ColumnPicker cols={cols} onChange={handleColChange} />
    </div>
  );

  const sectorHeader = (sec, list) => {
    const sv = list.reduce((s, p) => s + (p.valuePLN ?? 0), 0);
    return (
      <div className="sg-inner">
        <span className="inline-block h-[9px] w-[9px] rounded-sm" style={{ background: SECTOR_COLORS[sec] || SECTOR_COLORS[SECTOR_OTHER] }} />
        {sectorLabel(sec)}
        <span className="sg-count">· {list.length}</span>
        <span className="sg-val">
          {(sv / 1000).toFixed(1)}k · {positionsValuePLN > 0 ? ((sv / positionsValuePLN) * 100).toFixed(1) : 0}%
        </span>
      </div>
    );
  };

  // ── Telefon: karty ──
  if (isMobile) {
    const blurCls = key => (isPrivate && PRIVATE_COLS.has(key) ? 'privacy-blur' : undefined);
    const gridCols = cols.filter(k => k !== 'valuePLN' && k !== 'plPLN');
    const card = pos => (
      <li key={pos.id ?? pos.symbol}>
        <div className="flex items-start gap-2 px-4 py-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(pos)}
            onKeyDown={e => { if (e.key === 'Enter') onOpen(pos); }}
            aria-label={t('pf_open_details').replace('{symbol}', pos.symbol)}
            className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left"
          >
            <TickerLogo symbol={pos.symbol} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-info">{pos.symbol}</span>
                    {symbolBadges(pos)}
                  </div>
                  {pos.name && pos.name !== pos.symbol && <div className="truncate text-[11px] text-faint">{pos.name}</div>}
                </div>
                <div className="shrink-0 text-right text-[13px]">
                  <div className={blurCls('valuePLN')}>{renderCell('valuePLN', pos, fxRates, divBySymbol, locale, displayCurrency)}</div>
                  <div className={cx('text-xs', blurCls('plPLN'))}>{renderCell('plPLN', pos, fxRates, divBySymbol, locale, displayCurrency)}</div>
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                {gridCols.map(key => (
                  <div key={key} className="flex min-w-0 justify-between gap-2">
                    <dt className="truncate text-faint">{getColLabel(key, t, { short: true })}</dt>
                    <dd className={cx('shrink-0 text-right', blurCls(key))}>{renderCell(key, pos, fxRates, divBySymbol, locale, displayCurrency)}</dd>
                  </div>
                ))}
                <div className="flex min-w-0 justify-between gap-2">
                  <dt className="truncate text-faint">{t('col_share_pct')}</dt>
                  <dd className={cx('shrink-0 text-right text-dim', isPrivate && 'privacy-blur')}>{fmt(shareOf(pos), 1, locale)}%</dd>
                </div>
              </dl>
            </div>
          </div>
          {rowMenu(pos)}
        </div>
        {noteEditing === pos.symbol && noteEditor(pos)}
      </li>
    );
    return (
      <Card>
        {toolbar}
        <ul className="divide-y divide-line">
          {grouped && groupedPositions
            ? groupedPositions.map(([sec, list]) => (
              <Fragment key={sec}>
                <li className="sector-group bg-panel-2 px-4 py-2">{sectorHeader(sec, list)}</li>
                {list.map(card)}
              </Fragment>
            ))
            : filteredSorted.map(card)}
        </ul>
      </Card>
    );
  }

  // ── Komputer: tabela ──
  const SortMark = ({ col }) => (sortCol === col
    ? (sortDir === 'asc' ? <ArrowUp size={11} aria-hidden className="text-accent-text" /> : <ArrowDown size={11} aria-hidden className="text-accent-text" />)
    : <ArrowUpDown size={11} aria-hidden className="opacity-0 group-hover/th:opacity-50" />);
  const ariaSort = col => (sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined);

  const row = pos => {
    const share = shareOf(pos);
    return (
      <Fragment key={pos.id ?? pos.symbol}>
        <tr className="group">
          <td
            className="sticky left-0 z-[1] cursor-pointer bg-panel transition-colors group-hover:bg-panel-hover"
            onClick={() => onOpen(pos)}
            title={t('pf_open_details').replace('{symbol}', pos.symbol)}
          >
            <div className="flex items-center gap-2.5">
              <TickerLogo symbol={pos.symbol} />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold text-info">{pos.symbol}</span>
                  {symbolBadges(pos)}
                </div>
                {pos.name && pos.name !== pos.symbol && <div className="text-[11px] text-faint">{pos.name}</div>}
              </div>
            </div>
          </td>
          {cols.map(key => (
            <td key={key} className={cx('right mono', isPrivate && PRIVATE_COLS.has(key) && 'privacy-blur')}>
              {renderCell(key, pos, fxRates, divBySymbol, locale, displayCurrency)}
            </td>
          ))}
          <td className={cx('right mono', isPrivate && 'privacy-blur')}>
            <div className="flex items-center justify-end gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full rounded-full bg-info" style={{ width: `${Math.min(share, 100)}%` }} />
              </div>
              <span className="w-10 text-right text-xs text-dim">{fmt(share, 1, locale)}%</span>
            </div>
          </td>
          <td className="!px-2">{rowMenu(pos)}</td>
        </tr>
        {noteEditing === pos.symbol && (
          <tr>
            <td colSpan={cols.length + 3} className="!p-0">{noteEditor(pos)}</td>
          </tr>
        )}
      </Fragment>
    );
  };

  const tot = filteredSorted.reduce((a, p) => ({
    value: a.value + (p.valuePLN ?? 0),
    pl: a.pl + (p.plPLN ?? 0),
    cost: a.cost + (p.costPLN ?? 0),
  }), { value: 0, pl: 0, cost: 0 });
  const totRetPct = tot.cost > 0 ? (tot.pl / tot.cost) * 100 : null;

  return (
    <Card>
      {toolbar}
      <div className="overflow-x-auto">
        {/* table-pro na <table>, nie na <tfoot>: reguły w tabs.css to
            `.table-pro tfoot td`, więc z klasą na samym tfoot wiersz sum nigdy
            nie dostawał odstępów, obramowania ani tła. */}
        <table className="data-table table-pro">
          <thead>
            <tr>
              <th aria-sort={ariaSort('symbol')} className="group/th sticky left-0 z-[2] whitespace-nowrap bg-panel text-left">
                <button type="button" onClick={() => handleSort('symbol')} className="inline-flex items-center gap-1 uppercase hover:text-fg">
                  {t('col_symbol')}<SortMark col="symbol" />
                </button>
              </th>
              {cols.map(key => (
                <th
                  key={key}
                  aria-sort={ariaSort(key)}
                  draggable
                  className={cx(
                    'group/th right whitespace-nowrap transition-[background,opacity] duration-100',
                    dragCol ? 'cursor-grabbing' : 'cursor-grab',
                    dragOverCol === key && '!bg-panel-2 outline outline-1 outline-accent',
                    dragCol === key && 'opacity-40',
                  )}
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragCol(key); }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverCol !== key) setDragOverCol(key); }}
                  onDrop={e => { e.preventDefault(); handleColDrop(key); setDragOverCol(null); }}
                  onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
                >
                  <button type="button" onClick={() => handleSort(key)} className="inline-flex flex-row-reverse items-center gap-1 uppercase hover:text-fg">
                    {getColLabel(key, t)}<SortMark col={key} />
                  </button>
                </th>
              ))}
              <th className="right">{t('col_share_pct')}</th>
              <th aria-label={t('pf_row_actions').replace('{symbol}', '')} />
            </tr>
          </thead>
          <tbody>
            {grouped && groupedPositions
              ? groupedPositions.map(([sec, list]) => (
                <Fragment key={sec}>
                  <tr className="sector-group"><td colSpan={cols.length + 3}>{sectorHeader(sec, list)}</td></tr>
                  {list.map(row)}
                </Fragment>
              ))
              : filteredSorted.map(row)}
          </tbody>
          {filteredSorted.length > 0 && (
            <tfoot>
              <tr>
                <td className="lbl sticky left-0 bg-panel-2">{t('totals')} · {filteredSorted.length}</td>
                {cols.map(key => {
                  if (key === 'valuePLN') return <td key={key} className={cx('text-right', isPrivate && 'privacy-blur')}>{fmt(portToDisp(tot.value), 2, locale)} {portCurrLabel}</td>;
                  if (key === 'plPLN') return <td key={key} className={cx('text-right', tot.pl >= 0 ? 'text-up' : 'text-down', isPrivate && 'privacy-blur')}>{tot.pl >= 0 ? '+' : ''}{fmt(portToDisp(tot.pl), 2, locale)} {portCurrLabel}</td>;
                  if (key === 'costPLN') return <td key={key} className={cx('text-right', isPrivate && 'privacy-blur')}>{fmt(portToDisp(tot.cost), 2, locale)} {portCurrLabel}</td>;
                  return <td key={key} />;
                })}
                <td className="text-right" title={t('totals_roi_hint')}>{totRetPct != null ? ((totRetPct >= 0 ? '+' : '') + fmt(totRetPct, 1, locale) + '%') : '—'}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
