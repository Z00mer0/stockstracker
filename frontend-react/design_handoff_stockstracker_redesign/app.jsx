/* app.jsx — root component & tweaks */
const { useState: useStateRoot } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "#00d97e",
  "density": "comfortable",
  "showTickerStrip": true
}/*EDITMODE-END*/;

function MyFundTweaks() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
    document.documentElement.style.setProperty("--accent", t.accent);
    document.documentElement.style.setProperty("--up", t.accent);
    document.documentElement.style.setProperty("--up-soft", t.accent + "1f");
  }, [t.theme, t.accent]);
  return (
    <TweaksPanel>
      <TweakSection title="Motyw">
        <TweakRadio label="Tryb" value={t.theme} options={[["dark", "Ciemny"], ["light", "Jasny"]]} onChange={v => setTweak("theme", v)} />
      </TweakSection>
      <TweakSection title="Akcent">
        <TweakColor label="Kolor akcentu" value={t.accent} options={["#00d97e", "#7c9eff", "#a78bfa", "#ffb020", "#ff4d6d"]} onChange={v => setTweak("accent", v)} />
      </TweakSection>
      <TweakSection title="Pasek indeksów">
        <TweakToggle label="Pokaż w nagłówku" value={t.showTickerStrip} onChange={v => setTweak("showTickerStrip", v)} />
      </TweakSection>
    </TweaksPanel>
  );
}

function App() {
  const [view, setView] = useStateRoot("dashboard");
  const [detail, setDetail] = useStateRoot("DNP.WA");

  // listen for tweak-driven ticker hide
  const [showTicker, setShowTicker] = useStateRoot(true);
  React.useEffect(() => {
    const obs = new MutationObserver(() => {});
    const handler = (e) => {
      if (e.data && e.data.type === "myfund_tweak" && "showTicker" in e.data) setShowTicker(e.data.showTicker);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  let screen = null;
  if (view === "dashboard") screen = <Dashboard setView={setView} setDetail={setDetail} />;
  else if (view === "portfolio") screen = <Portfolio setView={setView} setDetail={setDetail} />;
  else if (view === "history") screen = <History />;
  else if (view === "tx") screen = <Transactions />;
  else if (view === "div") screen = <Dividends />;
  else if (view === "calendar") screen = <Calendar />;
  else if (view === "watch") screen = <Watchlist setView={setView} setDetail={setDetail} />;
  else if (view === "scenario") screen = <ScenarioLab />;
  else if (view === "analytics") screen = <Attribution />;
  else if (view === "detail") screen = <StockDetail sym={detail} setView={setView} setDetail={setDetail} />;
  else if (view === "settings") screen = <Settings />;

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} />
      <div className="main">
        <Topbar onAdd={() => { setView("tx"); }} />
        {screen}
      </div>
      <MyFundTweaks />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
