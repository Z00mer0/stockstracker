# Backlog — pozostałe punkty audytu

Stan na 25.07.2026. Audyt obejmował 26 znalezisk: 4 krytyczne, 6 wysokich, 16 średnich.
**Zamknięte: 17 — komplet krytycznych i komplet wysokich.** Poniżej to, co zostało.

Nic z tej listy nie blokuje codziennego korzystania z aplikacji.

---

## Dług techniczny — do wzięcia w dowolnej kolejności

### Ostrzeżenia lintera
103 ostrzeżeń przepuszczanych przez CI: nieużywane zmienne i brakujące
zależności w `useEffect`. Do przerobienia stopniowo — blokowanie na nich
od razu zablokowałoby każdy PR.

### P3-16 · Diagnostyka przez `print()`
Bez poziomów, bez znaczników czasu. Moduł `logging` sprawiłby, że logi
Rendera dałoby się filtrować. Ma znaczenie dopiero przy szukaniu awarii.

### P3-11 · Dostępność — częściowo
Globalny `:focus-visible` dodany, więc nawigacja Tabem jest już widoczna
na wszystkich 214 przyciskach naraz.

Zostaje etykietowanie ~107 przycisków ikonowych (`aria-label`). Świadomie
nieruszone: to ręczna robota przycisk po przycisku, przy której łatwo
wpisać etykietę mijającą się z faktycznym działaniem. Wymaga przejścia
po kolei, nie automatu.

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

**To jedyna pozycja, której nie da się domknąć z kodu.** Wymaga konta na
zewnętrznej usłudze — rejestracji i poświadczeń, których nie da się załatwić
po stronie repozytorium.

Zewnętrzny pinger na `https://stockstracker.onrender.com/api/health`, co
**10 minut** (nie 15 — Render zasypia właśnie po 15). cron-job.org albo
UptimeRobot, oba mają darmowy plan wystarczający do tego zadania.

Jeśli pinger pozwala na warunek sukcesu po treści odpowiedzi, warto wpisać
`"ok"` — wtedy alert przyjdzie także wtedy, gdy serwer zacznie zwracać coś
dziwnego, co domyka **P3-15**.

**Uwaga o metodzie HTTP:** UptimeRobot domyślnie pyta metodą `HEAD`, nie `GET`.
Serwer nie obsługiwał HEAD-a na `/api/health` i klasa bazowa odpowiadała 404 —
monitoring zgłaszał awarię, choć serwis działał. Naprawione; gdyby jednak
podpiąć inne narzędzie, warto sprawdzić, jakiej metody używa.

Alternatywa bez zewnętrznej usługi: płatny plan Rendera (~7 USD/mies.),
gdzie usypianie w ogóle nie występuje.

#### Co jest zrobione po stronie repozytorium

Dwa niezależne harmonogramy w GitHub Actions pukają do serwera: `keepalive.yml`
(`/api/health`) i `push-check.yml` (`/api/push/check`). Każdy bieg keepalive
pinguje przez ~28 min, żeby bridżować opóźnienia crona.

**To łagodzi problem, ale go nie rozwiązuje.** Harmonogram Actions jest
best-effort: na 170 rzeczywistych uruchomieniach odstępy wynosiły od 14 min
do 3 h 24 min przy nominalnych 10. Dłuższy bieg pokrywa większą część tego
rozrzutu, ale wielogodzinnej luki nie pokryje nic po tej stronie — i nie ma
sensu ciągnąć tego dalej, bo Actions nie jest usługą cron ani monitoringu.

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
| P3-6 | 17 MB śmieci wypisanych ze śledzenia | #44 |
| P3-12 | `ConfirmModal` zamiast natywnego `confirm()` | #44 |
| P3-13 | Tabele w kontenerach przewijalnych | #44 |
| P3-15 | Monitoring — UptimeRobot na `/api/health` co 5 min | (poza repo) |
