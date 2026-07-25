# Podatności zależności — stan i decyzje

Stan po `npm audit fix` (frontend-react). Plik istnieje, bo workflow `npm-audit`
blokuje tylko podatności `critical` — tutaj jest zapisane, dlaczego pozostałe
`high` zostały świadomie zostawione.

## Załatane

`axios` 1.16.0 → 1.18.1, `react-router` 7.15.0 → 7.18.1, `postcss` 8.5.14 → 8.5.23,
`form-data` 4.0.5 → 4.0.6, `fast-uri` 3.1.2 → 3.1.4, `brace-expansion` 5.0.6 → 5.0.8.
Zmiany są wyłącznie w `package-lock.json` — żadna deklarowana wersja w
`package.json` nie ruszona, build przechodzi.

## Zostawione świadomie

### `xlsx` (SheetJS) — Prototype Pollution + ReDoS, brak poprawki na npm
Pakiet na npm jest nieutrzymywany; łatki wychodzą tylko na `cdn.sheetjs.com`.
Parsuje pliki wgrywane przez użytkownika (import od brokera), więc to realna
powierzchnia ataku — ale wymaga osobnej decyzji (zmiana źródła pakietu albo
przeniesienie parsowania na backend). Osobny punkt audytu (P2-1).

### `vite` ≤ 6.4.2 — path traversal w serwerze deweloperskim
Dotyczy wyłącznie `vite dev` na maszynie dewelopera; artefakt produkcyjny
(`vite build`) nie jest podatny. Poprawka wymaga skoku vite 5 → 8, który
pociąga `@vitejs/plugin-react` 4 → 6, a ten wymusza `@babel/core` 8 przy
`@babel/core` 7 w reszcie drzewa. Konflikt peer dependencies nie rozwiązuje się
bez `--legacy-peer-deps`, czyli rozwiązania, które npm sam nazywa
„potentially broken". Nie warte ryzyka dla podatności nieobecnej na produkcji.

### `react-router` 7.12.0–8.2.0 — CSRF bypass w trybie RSC
Aplikacja jest czystym SPA po stronie klienta i nie używa trybu RSC (React
Server Components), więc podatna ścieżka nie jest wykonywana. Wyjście poza
zakres wymaga `react-router` 8.3.0, czyli majora routera — nieproporcjonalne do
niewystępującego tu ryzyka.

### `ejs`, `jake`, `filelist`, `minimatch`, `brace-expansion` (2.x) — DoS
Wszystkie wchodzą tranzytywnie przez `vite-plugin-pwa` → `workbox-build`.
Narzędzia budowania, uruchamiane na naszych własnych plikach — nie przetwarzają
danych z zewnątrz. `npm audit` proponuje „naprawę" przez zejście
`vite-plugin-pwa` 1.3 → 1.2, czyli downgrade.

## Uwaga o liczniku `npm audit`

Po `npm audit fix` łączna liczba zgłoszeń rośnie z 11 do 13. To artefakt
raportowania: gdy jedynym proponowanym lekarstwem jest major upgrade paczki
nadrzędnej, npm wypisuje osobno każdy węzeł łańcucha zależności zamiast samego
korzenia. Liczba realnych problemów zmalała.
