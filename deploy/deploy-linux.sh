#!/usr/bin/env bash
# Deploy DEGSON dashboard on Ubuntu/Debian with systemd and Nginx.
set -Eeuo pipefail

APP=degson-dashboard
SERVICE=degson-bi
APP_ROOT=/opt/$APP
CONFIG_DIR=/etc/$APP
ENV_FILE=$CONFIG_DIR/bi.env
SERVICE_FILE=/etc/systemd/system/$SERVICE.service
UPLOAD_DIR=
SERVER_NAME=
APP_USER=dashboard
PORT=3000
BI_BASE_URL=http://10.10.10.205
BI_SHARE_PAGE_URL=http://10.10.10.205/jeecg-boot/drag/share/view/1272000000000001003

usage() {
  cat <<'EOF'
Usage:
  sudo bash deploy-linux.sh --source DIR --server-name DOMAIN_OR_IP [options]

Required:
  --source DIR          Directory containing dist/ and dist-server/
  --server-name NAME    Hostname or IP used to access the site

Options:
  --app-user USER       systemd service account (default: dashboard)
  --port PORT           Node API port (default: 3000)
  --help                Show this help

Existing /etc/degson-dashboard/bi.env is preserved. On first install,
default BI settings are written there with mode 600. No other Nginx site
is removed or edited.
EOF
}
fail() { echo "ERROR: $*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }

while (($#)); do
  case "$1" in
    --source) UPLOAD_DIR=${2:?--source requires a directory}; shift 2 ;;
    --server-name) SERVER_NAME=${2:?--server-name requires a hostname or IP}; shift 2 ;;
    --app-user) APP_USER=${2:?--app-user requires a username}; shift 2 ;;
    --port) PORT=${2:?--port requires a port}; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown argument: $1 (run --help)" ;;
  esac
done

[[ $EUID -eq 0 ]] || fail 'Run this script with sudo.'
[[ -n $UPLOAD_DIR && -n $SERVER_NAME ]] || { usage; fail 'Both --source and --server-name are required.'; }
[[ $PORT =~ ^[0-9]+$ ]] && ((PORT > 0 && PORT < 65536)) || fail "Invalid port: $PORT"
[[ $APP_USER =~ ^[a-z_][a-z0-9_-]*[$]?$ ]] || fail "Invalid Linux username: $APP_USER"
UPLOAD_DIR=$(cd "$UPLOAD_DIR" 2>/dev/null && pwd) || fail 'Upload directory does not exist.'
[[ -s $UPLOAD_DIR/dist/index.html ]] || fail 'dist/index.html is missing.'
[[ -s $UPLOAD_DIR/dist-server/index.js ]] || fail 'dist-server/index.js is missing.'
command -v systemctl >/dev/null || fail 'systemd is required.'
command -v nginx >/dev/null || fail 'Nginx is not installed.'
NODE_BIN=$(command -v node || true)
[[ -n $NODE_BIN ]] || fail 'Node.js is not installed.'
NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
((NODE_MAJOR >= 22)) || fail "Node.js 22+ is required; found $(node -v)."
command -v curl >/dev/null || fail 'curl is required; install it with apt install curl.'

if [[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]]; then
  NGINX_FILE=/etc/nginx/sites-available/$APP
  NGINX_LINK=/etc/nginx/sites-enabled/$APP
  NGINX_STYLE=sites
elif [[ -d /etc/nginx/conf.d ]]; then
  NGINX_FILE=/etc/nginx/conf.d/$APP.conf
  NGINX_LINK=
  NGINX_STYLE=conf.d
else
  fail 'Cannot identify Nginx site directory.'
fi

BACKUP_DIR=/var/backups/$APP/$(date +%Y%m%d%H%M%S)
install -d -m 700 "$BACKUP_DIR"
for file in "$NGINX_FILE" "$SERVICE_FILE" "$ENV_FILE"; do
  [[ ! -e $file ]] || cp -a "$file" "$BACKUP_DIR/"
done

log 'Preparing service account'
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --user-group --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi
APP_GROUP=$(id -gn "$APP_USER")

log 'Installing an immutable release'
install -d -o root -g "$APP_GROUP" -m 755 "$APP_ROOT" "$APP_ROOT/releases"
RELEASE_ID=$(date +%Y%m%d%H%M%S)
RELEASE=$APP_ROOT/releases/$RELEASE_ID
install -d -o "$APP_USER" -g "$APP_GROUP" -m 755 "$RELEASE"
cp -a "$UPLOAD_DIR/dist" "$UPLOAD_DIR/dist-server" "$RELEASE/"
chown -R "$APP_USER:$APP_GROUP" "$RELEASE"
chmod -R u=rwX,go=rX "$RELEASE"
OLD_TARGET=$(readlink "$APP_ROOT/current" 2>/dev/null || true)
ln -s "$RELEASE" "$APP_ROOT/.current-$RELEASE_ID"
mv -Tf "$APP_ROOT/.current-$RELEASE_ID" "$APP_ROOT/current"

log 'Preparing protected BI environment file'
install -d -o root -g root -m 755 "$CONFIG_DIR"
if [[ ! -e $ENV_FILE ]]; then
  ENV_TMP=$(mktemp)
  printf 'HOST=127.0.0.1\nPORT=%s\nBI_BASE_URL=%s\nBI_SHARE_PAGE_URL=%s\n' \
    "$PORT" "$BI_BASE_URL" "$BI_SHARE_PAGE_URL" > "$ENV_TMP"
  install -o root -g root -m 600 "$ENV_TMP" "$ENV_FILE"
  rm -f "$ENV_TMP"
else
  chown root:root "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log 'Keeping existing BI environment file.'
fi

log 'Installing systemd service'
SERVICE_TMP=$(mktemp)
cat > "$SERVICE_TMP" <<EOF
[Unit]
Description=DEGSON dashboard BI API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_ROOT/current
Environment=NODE_ENV=production
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $APP_ROOT/current/dist-server/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF
install -o root -g root -m 644 "$SERVICE_TMP" "$SERVICE_FILE"
rm -f "$SERVICE_TMP"

log 'Installing Nginx site'
NGINX_TMP=$(mktemp)
cat > "$NGINX_TMP" <<EOF
server {
    listen 80;
    server_name $SERVER_NAME;
    root $APP_ROOT/current/dist;
    index index.html;

    location /api/bi/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }

    location /assets/ {
        try_files \$uri =404;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
install -o root -g root -m 644 "$NGINX_TMP" "$NGINX_FILE"
rm -f "$NGINX_TMP"
if [[ $NGINX_STYLE == sites ]]; then
  if [[ -e $NGINX_LINK && ! -L $NGINX_LINK ]]; then
    fail "$NGINX_LINK exists and is not a symlink. No other site was changed."
  fi
  ln -sfn "$NGINX_FILE" "$NGINX_LINK"
fi

log 'Validating Nginx before applying'
if ! nginx -t; then
  if [[ -n $OLD_TARGET ]]; then ln -sfn "$OLD_TARGET" "$APP_ROOT/current"; else rm -f "$APP_ROOT/current"; fi
  fail "Nginx validation failed. Config backup is in $BACKUP_DIR"
fi

log 'Enabling and starting services'
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"
systemctl enable nginx
systemctl reload nginx

log 'Checking API health'
for attempt in {1..15}; do
  if curl -fsS "http://127.0.0.1:$PORT/healthz"; then
    printf '\nDeployment succeeded. URL: http://%s/\nRelease: %s\nBackup: %s\n' "$SERVER_NAME" "$RELEASE" "$BACKUP_DIR"
    exit 0
  fi
  sleep 1
done
systemctl --no-pager --full status "$SERVICE" || true
journalctl -u "$SERVICE" -n 50 --no-pager || true
if [[ -n $OLD_TARGET ]]; then ln -sfn "$OLD_TARGET" "$APP_ROOT/current"; fi
fail "Health check failed. Logs shown above; config backup is in $BACKUP_DIR"
