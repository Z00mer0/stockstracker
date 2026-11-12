# Aplikacja na AWS Lightsail

Skrypt `deploy/aws/setup.sh` stawia na jednym serwerze pełną kopię aplikacji:
stronę, funkcje z `/api` (kursy, wykresy, wyszukiwarka) i `server.py`.
Baza zostaje na Neon — serwer łączy się z nią tak samo jak Render.

Własna domena nie jest konieczna: serwer może działać pod darmowym adresem
`sslip.io` zbudowanym z jego IP (np. dla `13.48.1.2` jest to
`13-48-1-2.sslip.io`). Domena jest potrzebna dopiero do automatycznego
przełączania (adres `*.vercel.app` należy do Vercela i nie da się go
przekierować gdzie indziej).

Darmowy plan AWS kończy się po 6 miesiącach albo po wyczerpaniu kredytów
i konto jest wtedy zamykane. Dlatego baza zostaje na Neon, usługa na Render
zostaje nieskasowana, a domeny nie kupuj w AWS — powrót to jedna zmiana
adresu w `vercel.json`.

## 1. Serwer

1. Lightsail → **Create instance** → Linux, **OS Only → Ubuntu 24.04**,
   najtańszy plan z publicznym adresem IPv4 i co najmniej 1 GB RAM.
2. Zakładka **Networking** instancji:
   - **Create static IP** i przypnij do instancji (darmowy, dopóki przypięty),
   - w **IPv4 Firewall** dodaj regułę **HTTPS (443)**; HTTP (80) i SSH (22) już są.
3. Jeśli masz domenę: u jej sprzedawcy dodaj rekord **A**
   `app.twojadomena.pl` → statyczny IP. Bez domeny pomiń ten krok.

## 2. Instalacja

Połącz się z serwerem (przycisk **Connect using SSH** w Lightsail) i wklej:

```bash
curl -fsSL https://raw.githubusercontent.com/Z00mer0/stockstracker/main/deploy/aws/setup.sh -o setup.sh
sudo bash setup.sh app.twojadomena.pl      # albo: 13-48-1-2.sslip.io
```

Trwa kilka minut. Potem uzupełnij zmienne — te same, które są w Render →
Environment:

```bash
sudo nano /etc/myfund.env
sudo systemctl restart myfund-api
```

Sprawdzenie: `https://app.twojadomena.pl/api/health` ma zwrócić odpowiedź,
a `https://app.twojadomena.pl` pokazać ekran logowania.

## Co działa na serwerze

| Usługa | Rola |
|---|---|
| `caddy` | HTTPS (certyfikat odnawia się sam), pliki strony, kierowanie `/api` |
| `myfund-api` | `server.py` na porcie 8765 |
| `myfund-fn` | funkcje z `/api` na porcie 8766 |
| `myfund-push.timer` | sprawdzenie powiadomień co 2 minuty |
| `myfund-update.timer` | co 15 minut pobiera `main` i przebudowuje, jeśli coś się zmieniło |

Logi: `journalctl -u myfund-api -f` (analogicznie `myfund-fn`, `caddy`).
Ręczna aktualizacja: `sudo bash /opt/myfund/deploy/aws/setup.sh`.

## Automatyczne przełączanie Vercel → AWS

Robi to DNS z kontrolą dostępności (Route 53, „failover routing”):

1. Route 53 → **Hosted zone** dla domeny; u sprzedawcy domeny ustaw serwery
   nazw z tej strefy.
2. **Health check**: HTTPS, domena `myfund-app.vercel.app`, ścieżka `/`.
   Ustaw najdłuższy odstęp i najmniejszą liczbę regionów — każde sprawdzenie
   to żądanie liczone do limitu Vercela.
3. Dwa rekordy `app.twojadomena.pl` z polityką **Failover**:
   - **Primary**: CNAME → `cname.vercel-dns.com`, z health checkiem z kroku 2,
   - **Secondary**: A → statyczny IP Lightsail.
   TTL 60 s.
4. W Vercel → Project → Domains dodaj `app.twojadomena.pl`.

Gdy Vercel przestaje odpowiadać, Route 53 w ciągu 1–2 minut zaczyna podawać
adres Lightsail, a po powrocie Vercela wraca sam. Adres aplikacji się nie
zmienia, więc logowanie i powiadomienia zostają.

Ograniczenie: certyfikat HTTPS na Lightsail da się wystawić i odnowić tylko
wtedy, gdy domena wskazuje na Lightsail. Zanim włączysz rekordy failover,
uruchom instalację ze zwykłym rekordem A (krok 1.3) i sprawdź, że strona
działa po HTTPS. Certyfikat jest ważny 90 dni; żeby zapasowy serwer nie
został z wygasłym, trzeba co ok. 2 miesiące przełączyć domenę na Lightsail
na kilka minut (albo skonfigurować w Caddy odnawianie przez DNS).

Prostsza alternatywa: domena wskazuje na Lightsail na stałe. Wtedy limity
Vercela w ogóle nie dotyczą ruchu i nic nie trzeba przełączać, a wersja na
`myfund-app.vercel.app` zostaje jako zapas.
