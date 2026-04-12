#!/usr/bin/env bash
# Run on deAgent01 after /tmp/piclaw_e2.env was copied from deAgent02 (operator merge).
# Appends missing keys only; does not overwrite PICLAW_TELEGRAM_TOKEN or Twitter if already set.
set -euo pipefail
E=/opt/piclaw/.env
T=/tmp/piclaw_e2.env
test -f "$T" || { echo "missing $T"; exit 1; }
sudo test -f "$E" || { echo "missing $E"; exit 1; }
addkv() {
  local k="$1"
  if grep -q "^${k}=" "$E" 2>/dev/null; then return 0; fi
  if grep -q "^${k}=" "$T" 2>/dev/null; then
    grep "^${k}=" "$T" | sudo tee -a "$E" >/dev/null
  fi
}
addkv OPENAI_API_KEY
addkv PICLAW_TELEGRAM_CHAT_ID
addkv PICLAW_TELEGRAM_OWNER_USER_IDS
addkv PICLAW_GITHUB_PAT
sudo chmod 600 "$E"
echo "merged; lines in $E: $(wc -l <"$E")"
