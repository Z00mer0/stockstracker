#!/usr/bin/env bash
# Stawia pełną kopię aplikacji na serwerze Ubuntu (AWS Lightsail):
# strona + funkcje z /api + server.py, z HTTPS przez Caddy.
# Ten sam skrypt służy do aktualizacji — można go uruchamiać wielokrotnie.
#
#   sudo bash setup.sh <domena>      pierwsze uruchomienie
#   sudo bash /opt/myfund/deploy/aws/setup.sh     aktualizacja
set -euo pipefail

# Całość w funkcji: aktualizacja podmienia ten plik w trakcie działania.
main() {
APP=/opt/myfund
ENV_FILE=/etc/myfund.env
REPO=https://github.com/Z00mer0/stockstracker.git
GIT="git -c safe.directory=$APP -C $APP"

if [ "${1:-}" = "--if-changed" ]; then
  shift
  $GIT fetch -q origin main
  [ "$($GIT rev-parse HEAD)" != "$($GIT rev-parse origin/main)" ] || exit 0
fi

DOMAIN="${1:-$(cat /etc/myfund.domain 2>/dev/null || true)}"
[ -n "$DOMAIN" ] || { echo "Podaj domenę: sudo bash setup.sh app.twojadomena.pl"; exit 1; }
echo "$DOMAIN" > /etc/myfund.domain

export DEBIAN_FRONTEND=noninteractive

# Build frontendu nie mieści się w 1 GB RAM bez pliku wymiany.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon -a

if ! command -v caddy >/dev/null || ! node -v 2>/dev/null | grep -q '^v22'; then
  apt-get update -q
  apt-get install -yq git curl python3-venv debian-keyring debian-archive-keyring apt-transport-https
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -yq nodejs caddy
fi

id myfund >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin myfund
if [ ! -d "$APP/.git" ]; then
  git clone -q "$REPO" "$APP"
else
  $GIT fetch -q origin main && $GIT reset -q --hard origin/main
fi

[ -d "$APP/.venv" ] || python3 -m venv "$APP/.venv"
"$APP/.venv/bin/pip" install -q -r "$APP/requirements.txt"
(cd "$APP/frontend-react" && npm ci --silent && npm run build --silent)
chown -R myfund:myfund "$APP"

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<ENV
# Skopiuj wartości z Render → Environment. Po zmianie: sudo systemctl restart myfund-api
DATABASE_URL=
VAPID_PRIVATE_KEY=
VAPID_PUBLIC_KEY=
PUSH_CRON_SECRET=
FINNHUB_TOKEN=
GROQ_API_KEY=
ALPHAVANTAGE_KEY=
# Poniższych nie zmieniaj.
PORT=8765
QUOTES_URL=http://127.0.0.1:8766
TRUSTED_PROXY_COUNT=1
ENV
  chmod 600 "$ENV_FILE"
fi

cat > /etc/systemd/system/myfund-api.service <<UNIT
[Unit]
Description=myfund server.py
After=network-online.target
Wants=network-online.target
[Service]
User=myfund
WorkingDirectory=$APP
EnvironmentFile=$ENV_FILE
ExecStart=$APP/.venv/bin/python server.py
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/myfund-fn.service <<UNIT
[Unit]
Description=myfund funkcje /api (Node)
After=network-online.target
[Service]
User=myfund
WorkingDirectory=$APP
ExecStart=/usr/bin/node $APP/deploy/aws/functions-server.mjs
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT

# Powiadomienia: sprawdzenie co 2 minuty, bez opóźnień harmonogramu GitHuba.
cat > /etc/systemd/system/myfund-push.service <<UNIT
[Unit]
Description=myfund push check
[Service]
Type=oneshot
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/curl -fsS -m 120 -o /dev/null -X POST -H "X-Push-Secret: \${PUSH_CRON_SECRET}" http://127.0.0.1:8765/api/push/check
UNIT
cat > /etc/systemd/system/myfund-push.timer <<UNIT
[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
UNIT

# Aktualizacja: co 15 minut, tylko gdy na main pojawił się nowy commit.
cat > /etc/systemd/system/myfund-update.service <<UNIT
[Unit]
Description=myfund aktualizacja z main
[Service]
Type=oneshot
ExecStart=/bin/bash $APP/deploy/aws/setup.sh --if-changed
UNIT
cat > /etc/systemd/system/myfund-update.timer <<UNIT
[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
[Install]
WantedBy=timers.target
UNIT

FN_PATHS=$(cd "$APP/api" && ls *.js | grep -v '^_' | sed 's|\.js$||; s|^|/api/|' | tr '\n' ' ')
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode zstd gzip
	@fn path $FN_PATHS
	handle @fn {
		reverse_proxy 127.0.0.1:8766
	}
	handle /api/* {
		reverse_proxy 127.0.0.1:8765
	}
	handle {
		root * $APP/frontend-react/dist
		try_files {path} /index.html
		file_server
	}
}
CADDY

systemctl daemon-reload
systemctl enable -q myfund-api myfund-fn caddy myfund-push.timer myfund-update.timer
systemctl restart myfund-api myfund-fn
systemctl start myfund-push.timer myfund-update.timer
systemctl reload caddy || systemctl restart caddy

if grep -q '^DATABASE_URL=$' "$ENV_FILE"; then
  echo
  echo "UWAGA: uzupełnij $ENV_FILE (sudo nano $ENV_FILE), potem: sudo systemctl restart myfund-api"
fi
echo "Gotowe: https://$DOMAIN"
}
main "$@"
