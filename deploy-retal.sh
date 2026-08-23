#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# RETAL DEPLOY SCRIPT
# ============================================================
#
# Usage:
#
#   ./deploy-retal.sh
#       Full deploy: Frontend + Backend + Nginx
#
#   ./deploy-retal.sh all
#       Same as above
#
#   ./deploy-retal.sh frontend
#       Frontend only, NO PM2 restart
#
#   ./deploy-retal.sh backend
#       Backend only + PM2 restart
#
#   ./deploy-retal.sh --no-restart
#       Full build/deploy but do NOT restart PM2
#
#   ./deploy-retal.sh --help
#       Show help
#
# Backend build:
#   If your project has one of these scripts, it will be used:
#     build:server
#     build:backend
#     server:build
#
#   Otherwise backend build is skipped and PM2 is restarted.
#
# ============================================================

APP_DIR="/opt/retal-api"
WEB_DIR="/var/www/retal"
NGINX_SITE="/etc/nginx/sites-available/tickets-sub"
PM2_APP="retal-api"

MODE="all"
RESTART_PM2="yes"

BACKUP_DIR="$APP_DIR/backups/deploy-$(date +%Y%m%d-%H%M%S)"

# ============================================================
# FUNCTIONS
# ============================================================

banner() {
    echo
    echo "============================================================"
    echo "$1"
    echo "============================================================"
}

fail() {
    echo
    echo "❌ ERROR: $1"
    echo
    echo "Deploy stopped."
    echo "Backup: $BACKUP_DIR"
    exit 1
}

cleanup_on_error() {
    echo
    echo "============================================================"
    echo "❌ DEPLOY FAILED"
    echo "============================================================"
    echo
    echo "Backup:"
    echo "$BACKUP_DIR"
    echo
}

trap cleanup_on_error ERR

usage() {
    cat <<'HELP'

RETAL DEPLOY

Usage:

  ./deploy-retal.sh
      Full deploy:
      Frontend + Backend + Nginx

  ./deploy-retal.sh all
      Same as above

  ./deploy-retal.sh frontend
      Frontend only
      - Build Vite
      - Verify PWA
      - Deploy dist
      - Reload Nginx
      - NO PM2 restart

  ./deploy-retal.sh backend
      Backend only
      - Optional backend build
      - Restart PM2
      - NO frontend deployment

  ./deploy-retal.sh --no-restart
      Full deployment but skip PM2 restart

  ./deploy-retal.sh frontend --no-restart
      Frontend only

  ./deploy-retal.sh backend --no-restart
      Backend build only, don't restart PM2

  ./deploy-retal.sh --help
      Show this help

Examples:

  ./deploy-retal.sh
  ./deploy-retal.sh all
  ./deploy-retal.sh frontend
  ./deploy-retal.sh backend
  ./deploy-retal.sh --no-restart

HELP
}

# ============================================================
# ARGUMENTS
# ============================================================

for ARG in "$@"; do
    case "$ARG" in
        all)
            MODE="all"
            ;;

        frontend)
            MODE="frontend"
            ;;

        backend)
            MODE="backend"
            ;;

        --no-restart)
            RESTART_PM2="no"
            ;;

        --help|-h)
            usage
            exit 0
            ;;

        *)
            echo "❌ Unknown option: $ARG"
            usage
            exit 1
            ;;
    esac
done

# ============================================================
# START
# ============================================================

cd "$APP_DIR"

banner "RETAL DEPLOY"

echo "Project:       $APP_DIR"
echo "Web:           $WEB_DIR"
echo "Nginx site:    $NGINX_SITE"
echo "PM2 app:       $PM2_APP"
echo "Mode:          $MODE"
echo "PM2 restart:   $RESTART_PM2"
echo "Backup:        $BACKUP_DIR"
echo

# ============================================================
# 1) BASIC CHECKS
# ============================================================

banner "1) BASIC CHECKS"

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

if command -v pm2 >/dev/null 2>&1; then
    echo "PM2:  $(pm2 -v)"
fi

echo "✅ Basic checks passed"

# ============================================================
# 2) BACKUP
# ============================================================

banner "2) BACKUP"

mkdir -p "$BACKUP_DIR"

# Project config
for FILE in \
    vite.config.ts \
    package.json \
    package-lock.json \
    ecosystem.config.js \
    ecosystem.config.cjs \
    ecosystem.config.json
do
    if [ -f "$FILE" ]; then
        cp -a "$FILE" "$BACKUP_DIR/"
        echo "Backed up: $FILE"
    fi
done

# Nginx
if [ -f "$NGINX_SITE" ]; then
    sudo cp -a "$NGINX_SITE" "$BACKUP_DIR/tickets-sub"
    echo "Backed up: Nginx config"
fi

# Existing frontend
if [ -f "$WEB_DIR/index.html" ]; then
    sudo cp -a "$WEB_DIR/index.html" "$BACKUP_DIR/index.html"
fi

if [ -f "$WEB_DIR/sw.js" ]; then
    sudo cp -a "$WEB_DIR/sw.js" "$BACKUP_DIR/sw.js"
fi

# PM2 state
if command -v pm2 >/dev/null 2>&1; then
    pm2 jlist > "$BACKUP_DIR/pm2-processes.json" 2>/dev/null || true
    pm2 save > /dev/null 2>&1 || true
fi

echo
echo "✅ Backup created:"
echo "$BACKUP_DIR"

# ============================================================
# 3) FRONTEND
# ============================================================

if [ "$MODE" = "frontend" ] || [ "$MODE" = "all" ]; then

    banner "3) FRONTEND — VERIFY PWA CONFIG"

    if [ ! -f vite.config.ts ]; then
        fail "vite.config.ts not found"
    fi

    if grep -q "globIgnores: \['\*\*/index.html'\]" vite.config.ts; then
        echo "✅ index.html excluded from Workbox precache"
    else
        fail "globIgnores for index.html is missing"
    fi

    if grep -q "skipWaiting: true" vite.config.ts; then
        echo "✅ skipWaiting enabled"
    else
        fail "skipWaiting is missing"
    fi

    if grep -q "clientsClaim: true" vite.config.ts; then
        echo "✅ clientsClaim enabled"
    else
        fail "clientsClaim is missing"
    fi

    # ========================================================
    # FRONTEND BUILD
    # ========================================================

    banner "4) FRONTEND — BUILD"

    rm -rf dist

    npm run build

    if [ ! -f dist/index.html ]; then
        fail "dist/index.html was not generated"
    fi

    if [ ! -f dist/sw.js ]; then
        fail "dist/sw.js was not generated"
    fi

    echo "✅ Frontend build completed"

    # ========================================================
    # VERIFY GENERATED SW
    # ========================================================

    banner "5) FRONTEND — VERIFY GENERATED SW"

    python3 - <<'PY'
from pathlib import Path
import re
import sys

sw = Path("dist/sw.js").read_text()

m = re.search(r"precacheAndRoute\(\[(.*?)\],\{\}\)", sw)

if not m:
    print("❌ Could not locate Workbox precache array")
    sys.exit(1)

precache = m.group(1)

if '"index.html"' in precache:
    print("❌ index.html IS IN WORKBOX PRECACHE")
    sys.exit(1)

print("✅ index.html NOT in Workbox precache")

urls = re.findall(r'\{url:"([^"]+)"', precache)

print(f"✅ Precache URLs: {len(urls)}")

if 'createHandlerBoundToURL("index.html")' in sw:
    print("✅ SPA navigation fallback exists")
else:
    print("⚠️ SPA navigation fallback missing")

if "skipWaiting()" in sw:
    print("✅ skipWaiting exists")
else:
    print("❌ skipWaiting missing")
    sys.exit(1)

if "clientsClaim()" in sw:
    print("✅ clientsClaim exists")
else:
    print("❌ clientsClaim missing")
    sys.exit(1)
PY

    # ========================================================
    # DEPLOY FRONTEND SAFELY
    # ========================================================

    banner "6) FRONTEND — DEPLOY DIST"

    sudo mkdir -p "$WEB_DIR"

    # Remove old frontend files only AFTER successful build
    sudo rm -rf "$WEB_DIR"/*

    sudo cp -a dist/. "$WEB_DIR/"

    sudo chown -R www-data:www-data "$WEB_DIR"

    echo "✅ Frontend deployed"

    # ========================================================
    # DEPLOYED FILES
    # ========================================================

    banner "7) FRONTEND — VERIFY DEPLOYED FILES"

    ls -lah "$WEB_DIR/index.html"
    ls -lah "$WEB_DIR/sw.js"

    echo
    echo "LIVE JS:"
    grep -oE 'assets/index-[^"]+\.js' \
        "$WEB_DIR/index.html" | head -1 || true

    echo
    echo "LIVE CSS:"
    grep -oE 'assets/index-[^"]+\.css' \
        "$WEB_DIR/index.html" | head -1 || true

fi

# ============================================================
# 8) BACKEND
# ============================================================

if [ "$MODE" = "backend" ] || [ "$MODE" = "all" ]; then

    banner "8) BACKEND — CHECK"

    if [ ! -f package.json ]; then
        fail "package.json not found"
    fi

    echo "Backend package detected"

    # ========================================================
    # DETECT BACKEND BUILD SCRIPT
    # ========================================================

    BACKEND_BUILD_SCRIPT=""

    if node -e '
const p=require("./package.json");
process.exit(p.scripts && p.scripts["build:server"] ? 0 : 1)
'; then
        BACKEND_BUILD_SCRIPT="build:server"

    elif node -e '
const p=require("./package.json");
process.exit(p.scripts && p.scripts["build:backend"] ? 0 : 1)
'; then
        BACKEND_BUILD_SCRIPT="build:backend"

    elif node -e '
const p=require("./package.json");
process.exit(p.scripts && p.scripts["server:build"] ? 0 : 1)
'; then
        BACKEND_BUILD_SCRIPT="server:build"
    fi

    # ========================================================
    # BACKEND BUILD
    # ========================================================

    if [ -n "$BACKEND_BUILD_SCRIPT" ]; then

        banner "9) BACKEND — BUILD"

        echo "Using npm script: $BACKEND_BUILD_SCRIPT"

        npm run "$BACKEND_BUILD_SCRIPT"

        echo "✅ Backend build completed"

    else

        echo
        echo "ℹ️ No dedicated backend build script found."
        echo "ℹ️ Skipping backend compilation."
        echo "ℹ️ PM2 will be restarted so the current backend source/runtime is reloaded."
        echo

    fi

    # ========================================================
    # PM2
    # ========================================================

    banner "10) PM2"

    if [ "$RESTART_PM2" = "yes" ]; then

        if pm2 describe "$PM2_APP" >/dev/null 2>&1; then

            echo "PM2 process found: $PM2_APP"

            pm2 restart "$PM2_APP" --update-env

            sleep 3

            echo
            echo "================ PM2 STATUS ================"

            pm2 status "$PM2_APP"

            echo
            echo "================ PM2 INFO ================"

            pm2 describe "$PM2_APP" | \
                grep -Ei \
                'status|pid|uptime|restarts|memory|cpu|script path' || true

            echo "✅ PM2 restarted"

        else

            echo "⚠️ PM2 process '$PM2_APP' was not found."

            echo
            echo "Current PM2 processes:"
            pm2 list

            echo
            echo "❌ Backend deploy cannot automatically restart '$PM2_APP'."
            echo "Check the PM2 process name."

            exit 1
        fi

    else

        echo "⏭️ PM2 restart skipped (--no-restart)"

    fi

fi

# ============================================================
# 11) NGINX
# ============================================================

if [ "$MODE" = "frontend" ] || [ "$MODE" = "all" ]; then

    banner "11) NGINX TEST"

    sudo nginx -t

    echo "✅ Nginx configuration valid"

    banner "12) NGINX RELOAD"

    sudo systemctl reload nginx

    sleep 2

    echo "✅ Nginx reloaded"

fi

# ============================================================
# 13) LIVE CACHE AUDIT
# ============================================================

if [ "$MODE" = "frontend" ] || [ "$MODE" = "all" ]; then

    banner "13) LIVE CACHE AUDIT"

    check_headers() {
        local URL="$1"

        echo
        echo ">>> $URL"

        curl -skI "$URL" |
            grep -Ei \
            'HTTP|cache-control|pragma|expires|etag|last-modified' || true
    }

    check_headers "https://tickets.knot-sys.com/"
    check_headers "https://tickets.knot-sys.com/index.html"
    check_headers "https://tickets.knot-sys.com/sw.js"

    WORKBOX=$(find "$WEB_DIR" -maxdepth 1 \
        -name 'workbox-*.js' \
        -printf '%f\n' | head -1 || true)

    if [ -n "$WORKBOX" ]; then
        check_headers "https://tickets.knot-sys.com/$WORKBOX"
    fi

fi

# ============================================================
# 14) LIVE SERVICE WORKER AUDIT
# ============================================================

if [ "$MODE" = "frontend" ] || [ "$MODE" = "all" ]; then

    banner "14) LIVE SERVICE WORKER AUDIT"

    python3 - <<'PY'
import re
import sys
import urllib.request

url = "https://tickets.knot-sys.com/sw.js"

req = urllib.request.Request(
    url,
    headers={
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
)

try:
    with urllib.request.urlopen(req, timeout=15) as r:
        sw = r.read().decode("utf-8", errors="replace")
except Exception as e:
    print(f"❌ Could not fetch live SW: {e}")
    sys.exit(1)

m = re.search(r"precacheAndRoute\(\[(.*?)\],\{\}\)", sw)

if not m:
    print("❌ Could not extract live precache array")
    sys.exit(1)

precache = m.group(1)

if '"index.html"' in precache:
    print("❌ LIVE SW STILL PRECACHES index.html")
    sys.exit(1)

print("✅ LIVE SW does NOT precache index.html")

urls = re.findall(r'\{url:"([^"]+)"', precache)

print(f"✅ LIVE precache URLs: {len(urls)}")

if 'createHandlerBoundToURL("index.html")' in sw:
    print("✅ LIVE SPA navigation fallback exists")
else:
    print("⚠️ LIVE SPA navigation fallback missing")

if "skipWaiting()" in sw:
    print("✅ LIVE skipWaiting exists")
else:
    print("⚠️ LIVE skipWaiting missing")

if "clientsClaim()" in sw:
    print("✅ LIVE clientsClaim exists")
else:
    print("⚠️ LIVE clientsClaim missing")
PY

fi

# ============================================================
# 15) FINAL
# ============================================================

banner "FINAL"

echo "Mode: $MODE"

if [ "$MODE" = "frontend" ] || [ "$MODE" = "all" ]; then
    echo "✅ Frontend build"
    echo "✅ PWA verified"
    echo "✅ Frontend deployed"
    echo "✅ Nginx reloaded"
    echo "✅ Live cache audited"
    echo "✅ Live Service Worker audited"
fi

if [ "$MODE" = "backend" ] || [ "$MODE" = "all" ]; then

    if [ "$RESTART_PM2" = "yes" ]; then
        echo "✅ Backend deployed"
        echo "✅ PM2 restarted"
    else
        echo "✅ Backend build/check completed"
        echo "⏭️ PM2 restart skipped"
    fi

fi

# ============================================================
# 15) DEPLOY SUCCESS — REMOVE TEMP BACKUP
# ============================================================

if [ -d "$BACKUP_DIR" ]; then
    echo
    echo "============================================================"
    echo "15) CLEANUP SUCCESSFUL DEPLOY BACKUP"
    echo "============================================================"

    sudo rm -rf "$BACKUP_DIR"

    if [ -d "$BACKUP_DIR" ]; then
        echo "⚠️ WARNING: Could not remove backup:"
        echo "$BACKUP_DIR"
    else
        echo "✅ Temporary deploy backup removed"
    fi
fi

echo
echo "============================================================"
echo "              ✅ DEPLOY COMPLETE"
echo "============================================================"
echo
echo "Examples:"
echo "  ./deploy-retal.sh frontend"
echo "  ./deploy-retal.sh backend"
echo "  ./deploy-retal.sh all"
echo "  ./deploy-retal.sh --no-restart"
echo
