#!/usr/bin/env bash
set -Eeuo pipefail

LEGACY_HOST="retal.knot-sys.com"
CANONICAL_HOST="tickets.knot-sys.com"
CERT_DIR="/etc/letsencrypt/live/${LEGACY_HOST}"
CERT_FILE="${CERT_DIR}/fullchain.pem"
KEY_FILE="${CERT_DIR}/privkey.pem"
TARGET_SITE="/etc/nginx/sites-available/retal-sub"
ENABLED_SITE="/etc/nginx/sites-enabled/retal-sub"
SOURCE_SITE="${1:-retal-sub.nginx.conf}"

fail() {
  printf 'RETAL TLS repair failed: %s\n' "$1" >&2
  exit 1
}

for command_name in openssl certbot nginx curl sudo readlink grep install; do
  command -v "$command_name" >/dev/null 2>&1 || fail "missing required command: $command_name"
done

sudo -n true || fail 'passwordless sudo is required for the deployment account'
[[ -r "$SOURCE_SITE" ]] || fail "Nginx source config is not readable: $SOURCE_SITE"

certificate_covers_legacy_host() {
  sudo -n test -r "$CERT_FILE" \
    && sudo -n openssl x509 -in "$CERT_FILE" -noout -checkhost "$LEGACY_HOST" >/dev/null 2>&1 \
    && sudo -n openssl x509 -in "$CERT_FILE" -noout -checkend 604800 >/dev/null 2>&1
}

if ! certificate_covers_legacy_host; then
  echo "Issuing or repairing the dedicated certificate for ${LEGACY_HOST}..."
  sudo -n certbot certonly \
    --nginx \
    --non-interactive \
    --agree-tos \
    --keep-until-expiring \
    --cert-name "$LEGACY_HOST" \
    -d "$LEGACY_HOST"
fi

certificate_covers_legacy_host || fail "certificate does not cover ${LEGACY_HOST} or expires in less than 7 days"
sudo -n test -r "$KEY_FILE" || fail "certificate private key is not readable: $KEY_FILE"

# Zero-trust guard: never overwrite another enabled Nginx site. The only exact
# legacy-host configuration this script may replace is the managed retal-sub site.
while IFS= read -r enabled_match; do
  [[ -n "$enabled_match" ]] || continue
  resolved_match="$(readlink -f "$enabled_match" 2>/dev/null || printf '%s' "$enabled_match")"
  if [[ "$resolved_match" != "$TARGET_SITE" && "$enabled_match" != "$TARGET_SITE" ]]; then
    fail "unexpected enabled Nginx config also owns ${LEGACY_HOST}: ${enabled_match}"
  fi
done < <(
  sudo -n grep -lRE \
    'server_name[[:space:]]+retal\.knot-sys\.com([[:space:];]|$)' \
    /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null || true
)

backup_file=""
if sudo -n test -e "$TARGET_SITE"; then
  backup_file="$(mktemp /tmp/retal-sub.nginx.XXXXXX)"
  sudo -n cp -a "$TARGET_SITE" "$backup_file"
fi

rollback() {
  if [[ -n "$backup_file" && -f "$backup_file" ]]; then
    sudo -n cp -a "$backup_file" "$TARGET_SITE" || true
  else
    sudo -n rm -f "$TARGET_SITE" || true
  fi
  sudo -n nginx -t >/dev/null 2>&1 && sudo -n systemctl reload nginx || true
}

cleanup() {
  [[ -z "$backup_file" ]] || rm -f "$backup_file"
}
trap cleanup EXIT

sudo -n install -m 0644 "$SOURCE_SITE" "$TARGET_SITE"
sudo -n ln -sfn "$TARGET_SITE" "$ENABLED_SITE"

if ! sudo -n nginx -t; then
  rollback
  fail 'nginx validation failed; previous Retal alias config was restored'
fi

sudo -n systemctl reload nginx

presented_cert="$(
  printf '\n' \
    | openssl s_client -connect 127.0.0.1:443 -servername "$LEGACY_HOST" -showcerts 2>/dev/null \
    | openssl x509 -outform PEM 2>/dev/null
)"
[[ -n "$presented_cert" ]] || fail 'Nginx did not present a TLS certificate for the legacy hostname'
printf '%s\n' "$presented_cert" \
  | openssl x509 -noout -checkhost "$LEGACY_HOST" >/dev/null 2>&1 \
  || fail 'Nginx is still presenting a certificate that does not cover the legacy hostname'

headers="$(curl -fsSI --resolve "${LEGACY_HOST}:443:127.0.0.1" "https://${LEGACY_HOST}/")"
printf '%s\n' "$headers" | grep -Eiq '^location:[[:space:]]+https://tickets\.knot-sys\.com/' \
  || fail "legacy hostname is not redirecting to https://${CANONICAL_HOST}/"

echo "Retal TLS alias repaired: https://${LEGACY_HOST} -> https://${CANONICAL_HOST}"
