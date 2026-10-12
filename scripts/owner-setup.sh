#!/bin/sh
# One-time owner sign-in setup for self-hosted Hare.
# Fills empty HARE_* values in .env and writes OWNER-ACCESS.txt (access key +
# authenticator secret) for you to open once, save, and delete.
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env

current() { sed -n "s/^$1=//p" .env | tail -n 1; }
put() {
  if grep -q "^$1=" .env; then
    tmp=$(mktemp) && awk -v k="$1" -v v="$2" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' .env >"$tmp" && mv "$tmp" .env
  else
    printf '%s=%s\n' "$1" "$2" >>.env
  fi
}

if [ -n "$(current HARE_OWNER_ACCESS_KEY_SHA256)" ] && [ "${1:-}" != "--rotate" ]; then
  echo "Owner sign-in is already set up. Run with --rotate to issue a new access key and authenticator secret."
  exit 0
fi

access_key=$(openssl rand -base64 36 | tr '+/' '-_' | tr -d '=\n')
key_hash=$(printf '%s' "$access_key" | openssl dgst -sha256 -r | cut -d' ' -f1)
totp_secret=$(node -e '
const b=require("crypto").randomBytes(20),a="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits=0,v=0,o="";
for(const x of b){v=(v<<8)|x;bits+=8;while(bits>=5){o+=a[(v>>>(bits-5))&31];bits-=5}}
if(bits>0)o+=a[(v<<(5-bits))&31];process.stdout.write(o)')

put HARE_OWNER_ACCESS_KEY_SHA256 "$key_hash"
put HARE_OWNER_TOTP_SECRET "$totp_secret"
put HARE_SESSION_SECRET "$(openssl rand -hex 32)"
[ -n "$(current HARE_DB_PASSWORD)" ] || put HARE_DB_PASSWORD "$(openssl rand -hex 24)"
chmod 600 .env

umask 077
cat >OWNER-ACCESS.txt <<TXT
Hare owner sign-in. Save both values in your password manager, then delete this file.

Access key:
$access_key

Authenticator secret (add to Google Authenticator / 1Password / Authy as a time-based code):
$totp_secret

Or paste this link into an app that accepts otpauth links:
otpauth://totp/Hare:owner?secret=$totp_secret&issuer=Hare&algorithm=SHA1&digits=6&period=30
TXT
echo "Wrote .env (HARE_* values) and OWNER-ACCESS.txt. Open OWNER-ACCESS.txt, save the values, then delete it."
echo "Restart Hare to apply: docker compose up -d app"
