# Backlog — pozostałe punkty audytu

Stan na 25.07.2026. Audyt obejmował 26 znalezisk: 4 krytyczne, 6 wysokich, 16 średnich.
**Zamknięte: 14 — komplet krytycznych i komplet wysokich.** Poniżej to, co zostało.

Nic z tej listy nie blokuje codziennego korzystania z aplikacji.

---

## Dług techniczny — do wzięcia w dowolnej kolejności

### Ostrzeżenia lintera
103 ostrzeżeń przepuszczanych przez CI: nieużywane zmienne i brakujące
zależności w `useEffect`. Do przerobienia stopniowo — blokowanie na nich
od razu zablokowałoby każdy PR.

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
| P3-4 | Jedna funkcja licząca wartość portfela | #42 |
| P3-9 | Pierwszy linter + naprawa 19 błędów | #42 |
| P2-5 | Token sesji w ciasteczku HttpOnly | #43 |
| P2-1 | SheetJS zastąpiony utrzymywaną biblioteką | #43 |
