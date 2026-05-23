/* shell.jsx — sidebar, topbar, icons */
const Ico = {
  dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
  portfolio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h18v13H3z"/><path d="M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>,
  history: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>,
  tx: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/></svg>,
  div: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  watch: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>,
  scenario: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 2v7.5L4 20a1 1 0 00.87 1.5h14.26A1 1 0 0020 20l-6-10.5V2"/><line x1="9" y1="2" x2="15" y2="2"/></svg>,
  analytics: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>,
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>,
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  star: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  filter: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  dl: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  chev: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
};

function Sidebar({ view, setView }) {
  const navTop = [
    { id: "dashboard", label: "Dashboard",  ico: Ico.dashboard },
    { id: "portfolio", label: "Portfel",    ico: Ico.portfolio },
    { id: "history",   label: "Historia",   ico: Ico.history },
    { id: "tx",        label: "Transakcje", ico: Ico.tx },
    { id: "div",       label: "Dywidendy",  ico: Ico.div },
    { id: "calendar",  label: "Kalendarz",  ico: Ico.calendar },
    { id: "watch",     label: "Watchlist",  ico: Ico.watch },
    { id: "scenario",  label: "Scenario Lab", ico: Ico.scenario },
    { id: "analytics", label: "Atrybucja",  ico: Ico.analytics },
  ];
  const navBot = [
    { id: "settings",  label: "Ustawienia",  ico: Ico.settings },
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 17 9 11 13 15 21 6"/>
            <polyline points="14 6 21 6 21 13"/>
          </svg>
        </div>
        <div className="brand-name">stockstracker<span className="dot">.</span></div>
      </div>
      <div className="nav-section">Główne</div>
      {navTop.map(n => (
        <div key={n.id} className={"nav-item" + (view === n.id ? " active" : "")} onClick={() => setView(n.id)}>
          <span className="ico">{n.ico}</span>{n.label}
        </div>
      ))}
      <div className="nav-section">Konto</div>
      {navBot.map(n => (
        <div key={n.id} className={"nav-item" + (view === n.id ? " active" : "")} onClick={() => setView(n.id)}>
          <span className="ico">{n.ico}</span>{n.label}
        </div>
      ))}
      <div className="sidebar-foot">
        <div className="avatar">A</div>
        <div style={{ minWidth: 0 }}>
          <div className="foot-name">Adam</div>
          <div className="foot-sub"><span className="dot-status"></span>● NYSE ● GPW ● LSE</div>
        </div>
      </div>
    </aside>
  );
}

function TickerStrip() {
  const items = MyFund.TICKER_STRIP;
  return (
    <div className="ticker-strip">
      {items.map((t, i) => (
        <div className="tk" key={i}>
          <span className="sym">{t.sym}</span>
          <span className="num" style={{ fontSize: 12 }}>{t.val}</span>
          <span className={"num " + (t.d >= 0 ? "up" : "down")} style={{ fontSize: 11.5 }}>
            {t.d >= 0 ? "+" : ""}{t.d.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function Topbar({ onAdd }) {
  return (
    <div className="topbar">
      <div className="search">
        <span className="ico">{Ico.search}</span>
        <input placeholder="Szukaj akcji, ETF, walut..." />
        <kbd>⌘K</kbd>
      </div>
      <TickerStrip />
      <div className="topbar-actions">
        <button className="iconbtn" title="Powiadomienia">{Ico.bell}<span className="dot-red"></span></button>
        <button className="btn primary" onClick={onAdd}>{Ico.plus} Dodaj transakcję</button>
      </div>
    </div>
  );
}

Object.assign(window, { Ico, Sidebar, Topbar, TickerStrip });
