# Backlog — pozostałe punkty audytu

Stan na 25.07.2026. Audyt obejmował 26 znalezisk: 4 krytyczne, 6 wysokich, 16 średnich.
**Zamknięte: 12.** Poniżej to, co zostało.

Nic z tej listy nie blokuje codziennego korzystania z aplikacji.

---

## Wymaga decyzji, nie tylko pracy

### P2-1 · `xlsx` (SheetJS) — Prototype Pollution + ReDoS
**Wysokie.** Pakiet na npm jest nieutrzymywany; łatki wychodzą wyłącznie na
`cdn.sheetjs.com`. `npm audit fix` nie ma czym tego naprawić.

Parsuje pliki wgrywane przez użytkownika (import od brokera), więc to realna
powierzchnia ataku — choć wyłącznie na własne dane, bo aplikacja jest
jednoosobowa.

Dwie drogi:
- **Zmiana źródła pakietu** na `https://cdn.sheetjs.com/xlsx-X.Y.Z/xlsx-X.Y.Z.tgz`
  w `package.json`. Szybkie, ale wypada z ekosystemu npm (brak `npm audit`,
  brak automatycznych aktualizacji).
- **Parsowanie na backendzie** w osobnym procesie. Solidniejsze, ale to
  przepisanie ścieżki importu i nowy endpoint przyjmujący pliki.

Nie do zrobienia „przy okazji" — obie opcje mają realne konsekwencje.

### P2-5 · Token w `localStorage`
**Wysokie.** Klucz `myfund_auth_token`. We własnym kodzie nie ma XSS-a (zero
`dangerouslySetInnerHTML` i `innerHTML` w ~24 tys. linii), ale zależności mają CVE.

TTL sesji z PR #36 ograniczył okno wycieku z „na zawsze" do 30 dni, więc
pilność spadła. Docelowo: ciasteczko `httpOnly` + `Secure` + `SameSite`.

Dotyka logowania po obu stronach naraz — backend musi ustawiać i czytać
ciasteczko, frontend przestać dokładać nagłówek `X-Auth-Token`. Do zrobienia
świadomie, nie w pośpiechu, bo błąd oznacza zablokowanie logowania.

---

## Dług techniczny — do wzięcia w dowolnej kolejności

### P3-4 · Logika wartości portfela zdublowana
`Dashboard.jsx` i `Portfolio.jsx` liczą to samo osobno. **To dług wprowadzony
w trakcie tych prac** — ten sam błąd wymagał dwóch osobnych PR-ów (#31 i #32),
bo poprawka w jednym miejscu nie działała w drugim.

Do wyciągnięcia: `usePortfolioValue(positions, cash, otherAssets, snapshots)`
zwracające `{ totalValue, staleTotal, partialPrices }`.

### P3-9 · Brak lintera
W kodzie są już komentarze `eslint-disable`, mimo że ESLint nigdy nie był
skonfigurowany. `eslint` + `eslint-plugin-react-hooks`, podpięty do workflow `ci`.

Wyłapałby m.in. brakujące zależności w `useEffect` — a takie błędy w tym
projekcie już występowały.

### P3-12 · Natywne `confirm()`
`AiInsights.jsx:527`, `Settings.jsx:381`, `Settings.jsx:621`. Wygląda obco
i nie da się przetłumaczyć. Do zastąpienia komponentem `ConfirmModal`.

### P3-13 · Tabele bez przewijania w poziomie
`ScenarioLab.jsx` i `SharedPortfolio.jsx` — pozostałe strony zawijają
poprawnie. Owinąć w `overflow-x: auto`.

### P3-6 · 13 MB śmieci w repo
174 pliki PNG + 372 pliki `.playwright-mcp`, śledzone mimo wpisów w
`.gitignore` (dodanych już po commicie — `.gitignore` nie działa wstecz).

`git rm --cached` na tych ścieżkach + commit. `filter-repo` tylko wtedy, gdy
zacznie przeszkadzać rozmiar klonowania.

### P3-16 · Diagnostyka przez `print()`
Bez poziomów, bez znaczników czasu. Moduł `logging` sprawiłby, że logi
Rendera dałoby się filtrować. Ma znaczenie dopiero przy szukaniu awarii.

### P3-11 · Dostępność
6 `aria-label` na 211 przycisków, brak widocznego stanu `:focus`.
Etykiety na przyciskach ikonowych + globalny `:focus-visible`.

### P3-3 · Logika mobilna tylko na jednej stronie
Z 14 stron tylko `Portfolio.jsx` reaguje na szerokość ekranu. Wspólny hook
`useIsMobile()` i przejście strona po stronie.

Duże, ale podzielne — warto brać po jednej stronie, zaczynając od tych,
których faktycznie używasz na telefonie.

### P3-5 · ~100 zaszytych polskich napisów
Mimo parytetu tłumaczeń 818/818 tryb angielski jest mieszany, bo część
napisów siedzi wprost w komponentach. Do przeniesienia na klucze; przydałaby
się reguła lintera na gołe napisy w JSX (zależy od P3-9).

### P3-8 · Przerośnięte pliki
`Portfolio.jsx` — 2003 linie (zawiera `OtherAssetsSection`, `BondsSection`
i modale), `Analysis.jsx` — 1414. Do rozbicia na osobne pliki.

Czysto kosmetyczne, ale utrudnia każdą kolejną zmianę.

---

## Domykane po Twojej stronie

### P3-10 · Cold start Rendera · P3-15 · Monitoring
Zewnętrzny pinger na `https://stockstracker.onrender.com/api/health`, co
**10 minut** (nie 15 — Render zasypia właśnie po 15).

GitHub Actions **nie wystarczy**: zmierzone na 170 rzeczywistych uruchomieniach
odstępy wynosiły od 14 min do 3 h 24 min przy nominalnych 10. Workflow
`keepalive.yml` zostaje jako druga, słabsza kłódka.

Jeśli pinger pozwala na warunek sukcesu po treści odpowiedzi, warto wpisać
`"ok"` — wtedy alert przyjdzie także wtedy, gdy serwer zacznie zwracać coś
dziwnego, co domyka **P3-15**.

---

## Zamknięte

| | Co | PR |
|---|---|---|
| P1-1 | Serwer wielowątkowy — koniec z DoS-em z jednego połączenia | #35 |
| P1-2 | Wygasanie sesji (TTL 30 dni) | #36 |
| P1-3 | Limiter odporny na podrobiony `X-Forwarded-For` | #36 |
| P1-4 | Zbiorcze notowania — 91 zapytań → 3 | #37 |
| P2-2 | Łatki zależności (wyjątki opisane w `AUDIT-NOTES.md`) | #36 |
| P2-3 | Granice błędów — koniec z białą stroną | #38 |
| P2-4 | Znacznik nieaktualnych kursów walut | #38 |
| P2-6 | Stały czas logowania — koniec z enumeracją kont | #40 |
| P3-1 | Pierwsze testy jednostkowe + CI (43 testy) | #39 |
| P3-2 | Leniwe ładowanie stron — 1953 KB → 466 KB | #37 |
| P3-7 | Limity rozmiaru cache'y w pamięci | #40 |
| P3-14 | Allowlista proxy sprawdzana przy przekierowaniach | #40 |
