#!/bin/bash
# ═══════════════════════════════════════════════════
#  deploy.sh — local commit/push + server deploy
#  Usage: npm run push
#         npm run push "رسالة الكوميت"
# ═══════════════════════════════════════════════════

set -e  # وقف لو حصل أي خطأ

# ── Colors ──────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}▶  $1${NC}"; }
ok()   { echo -e "${GREEN}✔  $1${NC}"; }
warn() { echo -e "${YELLOW}⚠  $1${NC}"; }
fail() { echo -e "${RED}✘  $1${NC}"; exit 1; }

# ── Config ───────────────────────────────────────────
SSH_HOST="knot"
API_DIR="/opt/retal-api"
FRONTEND_DIR="/opt/retal"          # مجلد الـ frontend على السيرفر (لو موجود)
NGINX_ROOT="/var/www/retal"
PM2_NAME="retal-api"

# ── Commit message ────────────────────────────────────
COMMIT_MSG="${1:-update: $(date '+%Y-%m-%d %H:%M')}"

echo ""
echo -e "${CYAN}══════════════════════════════════════${NC}"
echo -e "${CYAN}   Retal Deploy Script                ${NC}"
echo -e "${CYAN}══════════════════════════════════════${NC}"
echo ""

# ════════════════════════════════════════
#  PART 1 — LOCAL: git commit + push
# ════════════════════════════════════════
log "التحقق من التغييرات المحلية..."

if git diff --quiet && git diff --cached --quiet; then
  warn "لا يوجد تغييرات محلية — سيتم تخطي الـ commit"
else
  log "إضافة الملفات..."
  git add -A

  log "كوميت: \"$COMMIT_MSG\""
  git commit -m "$COMMIT_MSG"

  log "رفع الكود على GitHub..."
  git push
  ok "تم رفع الكود بنجاح ✓"
fi

echo ""

# ════════════════════════════════════════
#  PART 2 — SERVER: pull + restart
# ════════════════════════════════════════
log "الاتصال بالسيرفر ($SSH_HOST)..."

ssh "$SSH_HOST" bash <<REMOTE_SCRIPT
set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "\${CYAN}── Backend (API) ─────────────────────────\${NC}"
cd "$API_DIR"
echo "▶  git pull..."
git pull

echo "▶  npm install..."
npm install --omit=dev --silent

echo "▶  npx prisma db push..."
npx prisma db push --accept-data-loss

echo "▶  npx prisma generate..."
npx prisma generate

echo "▶  npm run build..."
npm run build

echo "▶  pm2 restart $PM2_NAME..."
pm2 restart "$PM2_NAME" --update-env
echo -e "\${GREEN}✔  API جاهز\${NC}"

# ── Frontend (لو فيه مجلد frontend على السيرفر) ──
if [ -d "$FRONTEND_DIR" ]; then
  echo ""
  echo -e "\${CYAN}── Frontend ───────────────────────────────\${NC}"
  cd "$FRONTEND_DIR"
  echo "▶  git pull..."
  git pull
  echo "▶  npm install..."
  npm install --silent
  echo "▶  npm run build..."
  npm run build
  echo "▶  نسخ الـ dist..."
  sudo cp -r dist/* "$NGINX_ROOT/"
  echo -e "\${GREEN}✔  Frontend جاهز\${NC}"
fi

echo ""
echo -e "\${GREEN}══ Deploy اكتمل بنجاح ══\${NC}"
pm2 list
REMOTE_SCRIPT

echo ""
ok "═══════════════════════════════"
ok " Deploy اكتمل بنجاح 🚀"
ok "═══════════════════════════════"
echo ""
