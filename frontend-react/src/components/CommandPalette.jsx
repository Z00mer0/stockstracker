import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, CornerDownLeft, EyeOff, FolderPlus, Moon, Plus, Search, TrendingUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useT } from '../context/LanguageContext';
import { usePrivacy } from '../context/PrivacyContext';
import { getNavBottom, getNavItems } from './layout/navItems.jsx';
import { rankCommands } from '../utils/commandSearch.js';
import { Modal, Spinner } from './ui';
import { cx } from './ui/cx.js';

// Paleta ⌘K: strony, akcje, portfele i spółki w jednym miejscu, z klawiatury.
export default function CommandPalette({ onClose, onOpenStock, onAddPosition, onNewPortfolio, onToggleTheme }) {
  const t = useT();
  const navigate = useNavigate();
  const { portfolio = [], portfolios = [], switchPortfolio, activePortfolioId } = useApp();
  const { toggle: togglePrivacy } = usePrivacy();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState([]);
  const [searching, setSearching] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // Spółki spoza portfela z wyszukiwarki giełdowej (od 2 znaków).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setRemote([]); return; }
    let cancelled = false;
    setSearching(true);
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then(r => (r.ok ? r.json() : { results: [] }))
        .then(j => { if (!cancelled) setRemote(j.results ?? []); })
        .catch(() => { if (!cancelled) setRemote([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query]);

  const commands = useMemo(() => {
    const pages = [...getNavItems(t), ...getNavBottom(t)].map(n => ({
      id: `page:${n.to}`, group: 'pages', label: n.label, icon: n.icon, run: () => navigate(n.to),
    }));
    const I = (C) => <C size={18} strokeWidth={2} aria-hidden />;
    const actions = [
      { id: 'act:add', group: 'actions', label: t('cmd_add_position'), keywords: [t('buy_more'), 'kup', 'buy'], icon: I(Plus), run: onAddPosition },
      { id: 'act:newpf', group: 'actions', label: t('nav_new_portfolio'), icon: I(FolderPlus), run: onNewPortfolio },
      { id: 'act:theme', group: 'actions', label: t('cmd_toggle_theme'), keywords: ['dark', 'light', 'ciemny', 'jasny'], icon: I(Moon), run: onToggleTheme },
      { id: 'act:privacy', group: 'actions', label: t('cmd_toggle_privacy'), keywords: ['ukryj', 'hide', 'privacy'], icon: I(EyeOff), run: togglePrivacy },
    ];
    const pfs = [{ id: 'all', name: t('nav_all') }, ...portfolios]
      .filter(p => p.id !== activePortfolioId)
      .map(p => ({ id: `pf:${p.id}`, group: 'portfolios', label: p.name, hint: p.currency, icon: I(Briefcase), run: () => switchPortfolio(p.id) }));
    const held = [...new Map(portfolio.map(p => [p.symbol, p])).values()].map(p => ({
      id: `stock:${p.symbol}`, group: 'stocks', label: p.symbol, hint: p.name || undefined, keywords: [p.name].filter(Boolean),
      icon: I(TrendingUp), run: () => onOpenStock(p),
    }));
    const heldSet = new Set(held.map(h => h.label));
    const market = remote.filter(r => !heldSet.has(r.symbol)).slice(0, 6).map(r => ({
      id: `mkt:${r.symbol}`, group: 'market', label: r.symbol, hint: [r.name, r.exchange].filter(Boolean).join(' · '),
      icon: I(Search), always: true,
      run: () => onOpenStock({ symbol: r.symbol, name: r.name, qty: 0, currency: r.exchange?.includes('Warsaw') || r.symbol.endsWith('.WA') ? 'PLN' : 'USD' }),
    }));
    return { base: [...held, ...pages, ...actions, ...pfs], market };
  }, [t, navigate, portfolio, portfolios, activePortfolioId, switchPortfolio, remote, onOpenStock, onAddPosition, onNewPortfolio, onToggleTheme, togglePrivacy]);

  // Bez zapytania: strony, akcje, portfele (spółki dopiero po wpisaniu).
  const results = useMemo(() => {
    const ranked = query.trim()
      ? rankCommands(commands.base, query)
      : commands.base.filter(c => c.group !== 'stocks');
    return [...ranked.slice(0, 12), ...commands.market];
  }, [commands, query]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function run(cmd) {
    onClose();
    // Po zamknięciu palety — okna otwierane przez akcję nie walczą o fokus.
    setTimeout(() => cmd.run?.(), 0);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); run(results[active]); }
  }

  const groupLabel = { stocks: t('cmd_group_stocks'), pages: t('cmd_group_pages'), actions: t('cmd_group_actions'), portfolios: t('cmd_group_portfolios'), market: t('cmd_group_market') };

  return (
    <Modal size="md" title={t('cmd_title')} onClose={onClose} initialFocusRef={inputRef} className="md:self-start md:mt-[12vh]">
      <div className="grid gap-2">
        <div className="relative">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('cmd_placeholder')}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-activedescendant={results[active] ? `cmd-${active}` : undefined}
            aria-label={t('cmd_title')}
            className="h-11 w-full rounded-card-sm border border-line bg-panel-2 pl-9 pr-9 text-[15px] text-fg placeholder:text-faint focus:border-accent focus:outline-none"
          />
          {searching && <Spinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />}
        </div>
        <ul id="cmd-list" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 && <li className="px-3 py-6 text-center text-small text-faint">{t('cmd_empty')}</li>}
          {results.map((c, i) => (
            <li key={c.id} role="presentation">
              {(i === 0 || results[i - 1].group !== c.group) && (
                <div className="px-3 pb-1 pt-2 text-label font-semibold uppercase text-faint">{groupLabel[c.group]}</div>
              )}
              <div
                id={`cmd-${i}`}
                data-idx={i}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => run(c)}
                className={cx('flex cursor-pointer items-center gap-3 rounded-card-sm px-3 py-2', i === active ? 'bg-panel-hover text-fg' : 'text-dim')}
              >
                <span className="shrink-0 text-faint">{c.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{c.label}</span>
                {c.hint && <span className="max-w-[45%] shrink-0 truncate text-[11px] text-faint">{c.hint}</span>}
                {i === active && <CornerDownLeft size={14} aria-hidden className="shrink-0 text-faint" />}
              </div>
            </li>
          ))}
        </ul>
        <p className="flex flex-wrap gap-x-3 border-t border-line pt-2 text-[11px] text-faint">
          <span><kbd className="font-mono">↑↓</kbd> {t('cmd_hint_move')}</span>
          <span><kbd className="font-mono">Enter</kbd> {t('cmd_hint_open')}</span>
          <span><kbd className="font-mono">Esc</kbd> {t('cmd_hint_close')}</span>
        </p>
      </div>
    </Modal>
  );
}
