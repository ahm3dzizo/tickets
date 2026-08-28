#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/retal-api"
WEB_DIR="/var/www/retal"
NGINX_SITE="/etc/nginx/sites-available/tickets-sub"
PM2_APP="retal-api"
MODE="all"
RESTART_PM2="yes"
BACKUP_DIR="$APP_DIR/backups/deploy-$(date +%Y%m%d-%H%M%S)"

banner() {
  echo
  echo "============================================================"
  echo "$1"
  echo "============================================================"
}

fail() {
  echo
  echo "❌ ERROR: $1"
  echo "Deploy stopped."
  echo "Backup: $BACKUP_DIR"
  exit 1
}

cleanup_on_error() {
  echo
  echo "============================================================"
  echo "❌ DEPLOY FAILED"
  echo "============================================================"
  echo "Backup: $BACKUP_DIR"
}
trap cleanup_on_error ERR

usage() {
  cat <<'HELP'
RETAL DEPLOY

Usage:
  ./deploy-retal.sh
  ./deploy-retal.sh all
  ./deploy-retal.sh frontend
  ./deploy-retal.sh backend
  ./deploy-retal.sh --no-restart
  ./deploy-retal.sh --help
HELP
}

for ARG in "$@"; do
  case "$ARG" in
    all) MODE="all" ;;
    frontend) MODE="frontend" ;;
    backend) MODE="backend" ;;
    --no-restart) RESTART_PM2="no" ;;
    --help|-h) usage; exit 0 ;;
    *) echo "❌ Unknown option: $ARG"; usage; exit 1 ;;
  esac
done

cd "$APP_DIR"

banner "RETAL DEPLOY"
echo "Project:       $APP_DIR"
echo "Web:           $WEB_DIR"
echo "Nginx site:    $NGINX_SITE"
echo "PM2 app:       $PM2_APP"
echo "Mode:          $MODE"
echo "PM2 restart:   $RESTART_PM2"
echo "Backup:        $BACKUP_DIR"

banner "1) BASIC CHECKS"
command -v git >/dev/null 2>&1 || fail "git not found"
command -v node >/dev/null 2>&1 || fail "node not found"
command -v npm >/dev/null 2>&1 || fail "npm not found"

if [ "$MODE" = "frontend" ] || [ "$MODE" = "all" ]; then
  command -v nginx >/dev/null 2>&1 || fail "nginx not found"
fi
if [ "$MODE" = "backend" ] || [ "$MODE" = "all" ]; then
  command -v pm2 >/dev/null 2>&1 || fail "pm2 not found"
fi

echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"
command -v pm2 >/dev/null 2>&1 && echo "PM2:  $(pm2 -v)"
echo "✅ Basic checks passed"

banner "2) GIT — PULL MAIN"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  fail "Tracked files have local changes. Commit or stash them before deploy."
fi

git fetch origin main
git pull --ff-only origin main

echo "✅ Repository updated from origin/main"
echo "Commit: $(git rev-parse --short HEAD)"

banner "3) BACKUP"
mkdir -p "$BACKUP_DIR"
for FILE in vite.config.ts package.json package-lock.json ecosystem.config.js ecosystem.config.cjs ecosystem.config.json; do
  if [ -f "$FILE" ]; then
    cp -a "$FILE" "$BACKUP_DIR/"
    echo "Backed up: $FILE"
  fi
done

if [ -f "$NGINX_SITE" ]; then
  sudo cp -a "$NGINX_SITE" "$BACKUP_DIR/tickets-sub"
  echo "Backed up: Nginx config"
fi
if [ -f "$WEB_DIR/index.html" ]; then sudo cp -a "$WEB_DIR/index.html" "$BACKUP_DIR/index.html"; fi
if [ -f "$WEB_DIR/sw.js" ]; then sudo cp -a "$WEB_DIR/sw.js" "$BACKUP_DIR/sw.js"; fi
command -v pm2 >/dev/null 2>&1 && pm2 jlist > "$BACKUP_DIR/pm2-processes.json" 2>/dev/null || true

echo "✅ Backup created: $BACKUP_DIR"

if [ "$MODE" = "frontend" ] || [ "$MODE" = "all" ]; then
  banner "4) FRONTEND — VERIFY PWA CONFIG"
  [ -f vite.config.ts ] || fail "vite.config.ts not found"

  grep -q "globIgnores: \['\*\*/index.html'\]" vite.config.ts \
    || fail "globIgnores for index.html is missing"
  echo "✅ index.html excluded from Workbox precache"

  if grep -q "strategies: 'injectManifest'" vite.config.ts; then
    echo "✅ PWA strategy: injectManifest"
    [ -f public/sw.js ] || fail "public/sw.js is missing"
    grep -Fq "self.skipWaiting()" public/sw.js || fail "self.skipWaiting() is missing from public/sw.js"
    if ! grep -Eq "clients\.claim\(\)|clientsClaim\(\)" public/sw.js; then
      fail "clients claim is missing from public/sw.js"
    fi
    grep -Fq "self.addEventListener('push'" public/sw.js || fail "push event handler is missing from public/sw.js"
    echo "✅ Custom Service Worker activation and push handler verified"
  else
    grep -q "skipWaiting: true" vite.config.ts || fail "skipWaiting is missing"
    grep -q "clientsClaim: true" vite.config.ts || fail "clientsClaim is missing"
    echo "✅ generateSW activation settings verified"
  fi

  banner "5) FRONTEND — BUILD"
  rm -rf dist
  npm run build
  [ -f dist/index.html ] || fail "dist/index.html was not generated"
  [ -f dist/sw.js ] || fail "dist/sw.js was not generated"
  echo "✅ Frontend build completed"

  banner "6) FRONTEND — VERIFY GENERATED SW"
  python3 - <<'PY'
from pathlib import Path
import sys

sw = Path('dist/sw.js').read_text(errors='replace')
if 'skipWaiting()' not in sw:
    print('❌ skipWaiting() missing from generated Service Worker')
    sys.exit(1)
if 'clients.claim()' not in sw and 'clientsClaim()' not in sw:
    print('❌ clients claim missing from generated Service Worker')
    sys.exit(1)
if "addEventListener('push'" not in sw and 'addEventListener("push"' not in sw:
    print('❌ push event handler missing from generated Service Worker')
    sys.exit(1)
print('✅ Generated Service Worker activation + push handler verified')
PY

  banner "7) FRONTEND — DEPLOY DIST"
  sudo mkdir -p "$WEB_DIR"
  sudo rm -rf "$WEB_DIR"/*
  sudo cp -a dist/. "$WEB_DIR/"
  sudo chown -R www-data:www-data "$WEB_DIR"
  echo "✅ Frontend deployed"

  banner "8) FRONTEND — VERIFY DEPLOYED FILES"
  ls -lah "$WEB_DIR/index.html"
  ls -lah "$WEB_DIR/sw.js"
  echo "LIVE JS:"
  grep -oE 'assets/index-[^"]+\.js' "$WEB_DIR/index.html" | head -1 || true
fi

if [ "$MODE" = "backend" ] || [ "$MODE" = "all" ]; then
  banner "9) BACKEND — CHECK"
  [ -f package.json ] || fail "package.json not found"

  BACKEND_BUILD_SCRIPT=""
  if node -e 'const p=require("./package.json");process.exit(p.scripts?.["build:server"]?0:1)'; then
    BACKEND_BUILD_SCRIPT="build:server"
  elif node -e 'const p=require("./package.json");process.exit(p.scripts?.["build:backend"]?0:1)'; then
    BACKEND_BUILD_SCRIPT="build:backend"
  elif node -e 'const p=require("./package.json");process.exit(p.scripts?.["server:build"]?0:1)'; then
    BACKEND_BUILD_SCRIPT="server:build"
  fi

  if [ -n "$BACKEND_BUILD_SCRIPT" ]; then
    banner "10) BACKEND — BUILD"
    npm run "$BACKEND_BUILD_SCRIPT"
    echo "✅ Backend build completed"
  else
    echo "ℹ️ No dedicated backend build script found; source runtime will be reloaded by PM2."
  fi

  banner "11) PM2"
  if [ "$RESTART_PM2" = "yes" ]; then
    pm2 describe "$PM2_APP" >/dev/null 2>&1 || fail "PM2 process '$PM2_APP' was not found"
    pm2 restart "$PM2_APP" --update-env
    sleep 3
    pm2 status "$PM2_APP"
    echo "✅ PM2 restarted"
  else
    echo "⏭️ PM2 restart skipped"
  fi
fi

if [ "$MODE" = "frontend" ] || [ "$MODE" = "all" ]; then
  banner "12) NGINX TEST"
  sudo nginx -t
  sudo systemctl reload nginx
  echo "✅ Nginx reloaded"

  banner "13) LIVE CACHE AUDIT"
  for URL in \
    "https://tickets.knot-sys.com/" \
    "https://tickets.knot-sys.com/index.html" \
    "https://tickets.knot-sys.com/sw.js"
  do
    echo
    echo ">>> $URL"
    curl -skI "$URL" | grep -Ei 'HTTP|cache-control|pragma|expires|etag|last-modified' || true
  done

  banner "14) LIVE SERVICE WORKER AUDIT"
  LIVE_SW="$(curl -sk "https://tickets.knot-sys.com/sw.js?t=$(date +%s)")"
  [ -n "$LIVE_SW" ] || fail "Could not fetch live Service Worker"
  grep -Fq "skipWaiting()" <<<"$LIVE_SW" || fail "LIVE skipWaiting missing"
  if ! grep -Fq "clients.claim()" <<<"$LIVE_SW" && ! grep -Fq "clientsClaim()" <<<"$LIVE_SW"; then
    fail "LIVE clients claim missing"
  fi
  if ! grep -Fq "addEventListener('push'" <<<"$LIVE_SW" && ! grep -Fq 'addEventListener("push"' <<<"$LIVE_SW"; then
    fail "LIVE push handler missing"
  fi
  echo "✅ Live Service Worker activation + push handler verified"
fi

banner "FINAL"
if [ "$MODE" = "frontend" ] || [ "$MODE" = "all" ]; then
  echo "✅ Frontend build/deploy"
  echo "✅ PWA verified"
  echo "✅ Nginx reloaded"
fi
if [ "$MODE" = "backend" ] || [ "$MODE" = "all" ]; then
  echo "✅ Backend checked/deployed"
  [ "$RESTART_PM2" = "yes" ] && echo "✅ PM2 restarted" || true
fi

if [ -d "$BACKUP_DIR" ]; then
  sudo rm -rf "$BACKUP_DIR"
  echo "✅ Temporary deploy backup removed"
fi

echo
echo "============================================================"
echo "              ✅ DEPLOY COMPLETE"
echo "============================================================"
