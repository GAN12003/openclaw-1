#!/bin/bash
# Append one KEY=value line to the env file. Reads line from stdin. Whitelist only.
# Usage: echo "PICLAW_SMTP_PASS=secret" | sudo ./append-piclaw-env.sh
# On Pi: sudoers entry so piclaw-02 can run: piclaw-02 ALL=(ALL) NOPASSWD: /opt/piclaw/scripts/append-piclaw-env.sh

ENV_FILE="${1:-/etc/piclaw.env}"
ALLOWED="PICLAW_TELEGRAM_TOKEN OPENAI_API_KEY PICLAW_TELEGRAM_CHAT_ID PICLAW_TELEGRAM_GROUP_REPLY_MODE PICLAW_SUPPRESS_EMBODIMENT_REMINDERS PICLAW_NOTIFY_WAKE_TELEGRAM PICLAW_HEALTH_CONNECTIVITY_ALERT_ENABLE PICLAW_HEALTH_CONNECTIVITY_PROBE_FULL PICLAW_HEALTH_CONNECTIVITY_LATENCY_MS PICLAW_TELEGRAM_REACTIONS_ENABLED PICLAW_TELEGRAM_REACTIONS_OWNER_ONLY PICLAW_TELEGRAM_REACTION_MAP PICLAW_TELEGRAM_CHAT_REPLY_THREAD PICLAW_GITHUB_PAT PICLAW_GITHUB_USERNAME PICLAW_TWITTER_AUTH_TOKEN PICLAW_TWITTER_CT0 PICLAW_TWITTER_SCREEN_NAME PICLAW_SMTP_HOST PICLAW_SMTP_USER PICLAW_SMTP_PASS PICLAW_SMTP_TEST_TO PICLAW_SMTP_PORT PICLAW_SMTP_SECURE PICLAW_MOLTBOOK_TOKEN PICLAW_MONTHLY_BUDGET PICLAW_WALLET_ADDRESS PICLAW_WALLET_LABEL PICLAW_IDENTITY_PATH PICLAW_MINI_APP_OWNER_TELEGRAM_ID"

read -r line || true
line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | head -1)
key="${line%%=*}"
if [ -z "$key" ] || [ "$key" = "$line" ]; then
  echo "invalid line" >&2
  exit 1
fi
value="${line#*=}"
ku=$(echo "$key" | tr '[:lower:]' '[:upper:]')
case "$ku" in
  MOLTBOOK_API|MOLTBOOK_TOKEN|PICLAW_MOLTBOOK_API) key="PICLAW_MOLTBOOK_TOKEN"; line="PICLAW_MOLTBOOK_TOKEN=${value}" ;;
  GITHUB_TOKEN|GH_TOKEN) key="PICLAW_GITHUB_PAT"; line="PICLAW_GITHUB_PAT=${value}" ;;
  *) key="$ku"; line="${key}=${value}" ;;
esac
case " $ALLOWED " in
  *" $key "*) ;;
  *) echo "key not allowed: $key" >&2; exit 1 ;;
esac
# No newlines in value
if echo "$line" | grep -q $'\n'; then
  echo "newlines not allowed" >&2
  exit 1
fi
echo "$line" >> "$ENV_FILE"
exit 0
