# Web Push — powiadomienia dla MyFund (design)

Data: 2026-07-13 · Status: zatwierdzony przez Adama

## Cel

Alerty w Watchliście działają dziś tylko przy otwartej aplikacji. Dodajemy Web Push,
żeby telefon budził się sam: (1) cena przebiła próg alertu, (2) jutro dzień ex-dividend
posiadanej spółki, (3) zbliża się wyczerpanie rocznego limitu IKE/IKZE.

## Architektura

```
GitHub Actions (cron ~10 min)
  └─ POST /api/push/check?secret=…   (budzi Render + uruchamia sprawdzanie)
       ├─ alerty cenowe  (co wywołanie)
       ├─ dywidendy      (raz dziennie)
       └─ limit IKE/IKZE (raz dziennie)
            └─ pywebpush → push service przeglądarki → sw.js → notyfikacja
```

Render jest na planie darmowym (usypia po ~15 min) — dlatego zewnętrzny budzik
zamiast wątku w tle. GH Actions może opóźnić cron o 5–15 min; akceptowalne.

## Backend (server.py)

### Zależności
- `pywebpush` w requirements.txt.

### Konfiguracja (env na Renderze)
- `VAPID_PRIVATE_KEY` — klucz prywatny VAPID (wygenerowany raz, nigdy w repo — repo jest PUBLICZNE).
- `VAPID_CLAIM_EMAIL` — `mailto:` do claimu VAPID.
- `PUSH_CRON_SECRET` — sekret autoryzujący `/api/push/check` (też w GitHub Secrets).

### Tabele
```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  username TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  subscription_json TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (username, endpoint)
);
CREATE TABLE IF NOT EXISTS push_sent (
  username TEXT NOT NULL,
  notif_key TEXT NOT NULL,       -- np. 'div:CDR.WA:2026-07-14', 'ike:2026:80'
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (username, notif_key)
);
```

### Endpointy
- `GET  /api/push/vapid-key` — publiczny klucz VAPID (bez auth).
- `POST /api/push/subscribe` (auth) — zapisuje subskrypcję urządzenia (upsert po endpoint).
- `POST /api/push/unsubscribe` (auth) — usuwa subskrypcję.
- `POST /api/push/test` (auth) — wysyła testowe powiadomienie na urządzenia użytkownika.
- `POST /api/push/check` — wymaga `PUSH_CRON_SECRET`; wykonuje sprawdzenia niżej.

Wysyłka: pywebpush per subskrypcja; odpowiedź 404/410 ⇒ subskrypcja wygasła ⇒ DELETE.

### Logika sprawdzeń (`/api/push/check`)
Tylko użytkownicy mający ≥1 subskrypcję.

1. **Alerty cenowe** (co wywołanie):
   z `user_watchlist.items_json` zbiera aktywne alerty (`above`/`below`),
   pobiera ceny hurtowo (istniejące źródła: finnhub/stooq/yahoo), porównuje.
   Trafienie ⇒ push „CDR.WA przebiło 150 zł (obecnie 152,30 zł)" ⇒ alert
   oznaczany w items_json jako `triggered` (jednorazowy — koniec spamu co 10 min).
2. **Dywidendy** (raz dziennie, dedupe przez push_sent):
   symbole z transakcji użytkownika (pozycje z qty > 0), istniejąca logika
   `/api/dividends/upcoming`; jeśli ex-date == jutro ⇒ push
   „Jutro ostatni dzień z prawem do dywidendy XYZ (0,45 USD/akcję)".
   Klucz dedupe: `div:{symbol}:{exDate}`.
3. **Limit IKE/IKZE** (raz dziennie):
   dla portfeli z accountType IKE/IKZE liczy wpłaty roczne
   (transakcje CASH z price > 0 w bieżącym roku, przeliczone na PLN — port
   logiki z IkeLimitCard.jsx wraz z tabelą limitów 2024–2026);
   push przy przekroczeniu 80% i 100% limitu, każdy próg raz na rok
   (klucze `ike:{rok}:80`, `ike:{rok}:100`).

„Raz dziennie" = w push_sent klucz `daily:{data}` per użytkownik zapisany przy
pierwszym wywołaniu danego dnia (UTC), kolejne wywołania pomijają sekcje 2–3.

## Frontend (frontend-react)

### Service worker — zmiana strategii (jedyne ryzyko)
vite-plugin-pwa przechodzi z `generateSW` (auto-Workbox) na **`injectManifest`**:
własny `src/sw.js` zachowuje precache (`precacheAndRoute(self.__WB_MANIFEST)`),
runtime cache NBP i prompt-update, a dodaje:
- `push` ⇒ `showNotification(title, { body, icon, data: { url } })`,
- `notificationclick` ⇒ fokus/otwarcie apki na `data.url`
  (alert cenowy → /watchlist, dywidenda → /dividends, IKE → /analysis).

Kryterium akceptacji: istniejące PWA działa jak dotąd (instalacja, offline,
prompt o aktualizacji) + odbiera pushe.

### UI
- Watchlista: przełącznik „🔔 Powiadomienia push" — `Notification.requestPermission()`,
  `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`,
  POST /api/push/subscribe; obok przycisk „Wyślij testowe".
- iOS: push wymaga apki dodanej do ekranu głównego (iOS 16.4+) — gdy Safari bez
  standalone, pokazujemy podpowiedź zamiast przełącznika.
- Teksty PL/EN w translations.

## Budzik — GitHub Actions
`.github/workflows/push-check.yml`: `schedule: '*/10 * * * *'` + `workflow_dispatch`,
krok: `curl -fsS -X POST -H "X-Push-Secret: $SECRET" https://stockstracker.onrender.com/api/push/check`
z sekretem z GitHub Secrets.

## Poza zakresem (świadomie)
Godziny ciszy, wybór typów powiadomień per użytkownik, alerty cykliczne,
powiadomienia o spadkach dziennych. Infrastruktura je umożliwia — dodamy na życzenie.

## Testy / weryfikacja
- Lokalnie: subskrypcja w Chrome (localhost jest secure context), `/api/push/test`,
  symulacja alertu z ręcznie wywołanym `/api/push/check`.
- Produkcyjnie: konto demo — alert cenowy z progiem tuż przy bieżącej cenie,
  ręczny `workflow_dispatch`, sprawdzenie notyfikacji + dedupe (drugi run nic nie wysyła).
