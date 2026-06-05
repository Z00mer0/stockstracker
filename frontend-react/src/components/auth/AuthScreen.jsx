import { useEffect, useId, useMemo, useState } from "react";
import "./auth.css";

/* ---------- GPW session status ---------- */
const GPW_HOLIDAYS = new Set([
  // 2025
  '2025-01-01','2025-01-06','2025-04-18','2025-04-21','2025-05-01',
  '2025-06-19','2025-08-15','2025-11-11','2025-12-24','2025-12-25','2025-12-26','2025-12-31',
  // 2026
  '2026-01-01','2026-01-06','2026-04-03','2026-04-06','2026-05-01',
  '2026-06-04','2026-11-11','2026-12-24','2026-12-25','2026-12-31',
  // 2027
  '2027-01-01','2027-01-06','2027-03-26','2027-03-29','2027-05-03',
  '2027-05-27','2027-11-01','2027-11-11','2027-12-24','2027-12-31',
]);

function isGpwSessionOpen() {
  const now = new Date();
  const waw = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
  const year  = waw.getFullYear();
  const month = String(waw.getMonth() + 1).padStart(2, '0');
  const day   = String(waw.getDate()).padStart(2, '0');
  const dow   = waw.getDay(); // 0=Sun, 6=Sat
  const mins  = waw.getHours() * 60 + waw.getMinutes();
  if (dow === 0 || dow === 6) return false;
  if (GPW_HOLIDAYS.has(`${year}-${month}-${day}`)) return false;
  return mins >= 9 * 60 && mins <= 17 * 60 + 5;
}

/* ---------- password strength (0–4) ---------- */
function scorePassword(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

const PW_META = [
  { label: "", color: "" },
  { label: "Słabe",   color: "var(--down)" },
  { label: "Średnie", color: "var(--warn)" },
  { label: "Dobre",   color: "var(--info)" },
  { label: "Silne",   color: "var(--up)"   },
];

export default function AuthScreen({
  variant = "terminal",
  defaultMode = "login",
  onLogin,
  onRegister,
  onForgotPassword,
}) {
  const [mode, setMode]           = useState(defaultMode);
  const [showPw, setShowPw]       = useState(false);
  const [username, setUsername]   = useState("");
  const [email, setEmail]         = useState("");
  const [pw, setPw]               = useState("");
  const [pw2, setPw2]             = useState("");
  const [remember, setRemember]   = useState(true);
  const [loading, setLoading]     = useState(false);
  const [serverError, setServerError] = useState(null);
  const [wig20, setWig20]             = useState(null);
  const uid = useId();

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL ?? '';
    fetch(`${base}/api/wig20-quote`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.changePct != null) setWig20(d); })
      .catch(() => {});
  }, []);

  const isReg     = mode === "register";
  const strength  = useMemo(() => scorePassword(pw), [pw]);
  const meta      = PW_META[strength];
  const mismatch  = isReg && pw2.length > 0 && pw2 !== pw;

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError(null);
    setLoading(true);
    try {
      if (isReg) {
        if (mismatch || pw.length < 8) return;
        await onRegister?.({ username, email, password: pw });
      } else {
        await onLogin?.({ username, password: pw, remember });
      }
    } catch (err) {
      setServerError(err.message || (isReg ? "Błąd rejestracji" : "Błąd logowania"));
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode(isReg ? "login" : "register");
    setPw("");
    setPw2("");
    setServerError(null);
  }

  const isTerm     = variant === "terminal";
  const sessionOpen = isGpwSessionOpen();

  return (
    <div className={`auth-stage ${isTerm ? "v-term" : "v-clean"}`}>
      <div className="auth-card">
        {/* brand */}
        <div className="auth-brand">
          <span className="mark"><TrendIcon size={isTerm ? 21 : 20} /></span>
          <div>
            <div className="name">stockstracker<span className="dot">.</span></div>
            {isTerm && <div className="tag">PORTFOLIO · REAL-TIME</div>}
          </div>
        </div>

        {/* terminal status strip */}
        {isTerm && (
          <div className="auth-status">
            <span className="live">
              <span className={`dot-status${sessionOpen ? '' : ' closed'}`} />
              {sessionOpen ? 'Sesja otwarta' : 'Sesja zamknięta'}
            </span>
            <span className="tk mono">
              <span className="sym">WIG20</span>
              {wig20 ? (
                <span style={{ color: wig20.changePct >= 0 ? 'var(--up)' : 'var(--down)' }}>
                  {wig20.changePct >= 0 ? '▲' : '▼'} {Math.abs(wig20.changePct).toFixed(2)}%
                </span>
              ) : (
                <span>—</span>
              )}
            </span>
          </div>
        )}

        {/* heading */}
        <div className="auth-head">
          <h1 className="auth-title">{isReg ? "Załóż konto" : "Zaloguj się"}</h1>
          <p className="auth-sub">
            {isReg
              ? "Kilka sekund i śledzisz swój portfel w czasie rzeczywistym."
              : "Witaj z powrotem — Twój portfel czeka."}
          </p>
        </div>

        {/* form */}
        <form className="auth-form-anim" key={mode} onSubmit={handleSubmit}>
          <Field label="Nazwa użytkownika" lead={<UserIcon />}>
            <input
              className="auth-input" type="text" placeholder="adamxdd"
              autoComplete="username" value={username}
              onChange={(e) => setUsername(e.target.value)} required
            />
          </Field>

          {isReg && (
            <Field label="E-mail" lead={<MailIcon />}>
              <input
                className="auth-input" type="email" placeholder="adam@example.com"
                autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} required
              />
            </Field>
          )}

          <Field
            label="Hasło" lead={<LockIcon />} hasTrail
            link={!isReg ? "Zapomniałeś hasła?" : undefined}
            onLink={onForgotPassword}
            trail={
              <button type="button" className="input-trail" tabIndex={-1}
                onClick={() => setShowPw((v) => !v)} aria-label="Pokaż hasło">
                <EyeIcon open={showPw} />
              </button>
            }
          >
            <input
              className="auth-input"
              type={showPw ? "text" : "password"}
              placeholder={isReg ? "Min. 8 znaków" : "••••••••••"}
              autoComplete={isReg ? "new-password" : "current-password"}
              value={pw} onChange={(e) => setPw(e.target.value)} required
            />
          </Field>

          {isReg && pw.length > 0 && (
            <div className="pw-strength">
              <div className="pw-bars">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="pw-bar"
                    style={{ background: i < strength ? meta.color : undefined }} />
                ))}
              </div>
              <div className="pw-meta">
                <span className="pw-label" style={{ color: meta.color }}>{meta.label}</span>
                <span className="pw-tip">Min. 12 znaków = silne</span>
              </div>
            </div>
          )}

          {isReg && (
            <Field label="Powtórz hasło" lead={<LockIcon />}>
              <input
                className="auth-input"
                type={showPw ? "text" : "password"}
                placeholder="Powtórz hasło" autoComplete="new-password"
                value={pw2} onChange={(e) => setPw2(e.target.value)} required
              />
              {mismatch
                ? <div className="field-hint err">Hasła nie są identyczne</div>
                : pw2.length > 0 ? <div className="field-hint ok">Hasła zgodne</div> : null}
            </Field>
          )}

          {!isReg && (
            <div className="check-row">
              <label className="checkbox" htmlFor={`${uid}-rm`}>
                <input id={`${uid}-rm`} type="checkbox" checked={remember}
                  onChange={(e) => setRemember(e.target.checked)} />
                <span className="box"><CheckIcon /></span>
                Zapamiętaj mnie
              </label>
            </div>
          )}
          {isReg && <div style={{ height: 4 }} />}

          {serverError && (
            <div className="auth-server-error">{serverError}</div>
          )}

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading
              ? (isReg ? "Tworzenie konta…" : "Logowanie…")
              : (isReg ? "Utwórz konto" : "Zaloguj")}
            {!loading && <ArrowRightIcon />}
          </button>
        </form>

        {/* footer switch */}
        <div className="auth-foot">
          {isReg ? "Masz już konto?" : "Nie masz jeszcze konta?"}
          <span className="switch" onClick={toggleMode}>
            {isReg ? "Zaloguj się" : "Zarejestruj się"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- field wrapper ---------- */
function Field({ label, link, onLink, lead, trail, hasTrail, children }) {
  return (
    <div className="field">
      <div className="field-label-row">
        <label className="auth-field-label">{label}</label>
        {link && <a className="field-link" onClick={onLink}>{link}</a>}
      </div>
      <div className={`input-wrap${lead ? " has-lead" : ""}${hasTrail ? " has-trail" : ""}`}>
        {lead && <span className="lead">{lead}</span>}
        {children}
        {trail}
      </div>
    </div>
  );
}

/* ---------- icons ---------- */
function TrendIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" />
    </svg>
  );
}
function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.16 3.19" />
      <path d="M6.6 6.6C3.7 8.27 2 11 2 11s3.5 7 10 7a8.9 8.9 0 0 0 4.4-1.15" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 6 10 7 10-7" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
