#!/usr/bin/env bash
# From your dev machine (Git Bash / WSL / macOS): configure SSH aliases on the Pi,
# optionally merge GitHub hostkeys, upload install-pi.sh, and run the one-shot install.
#
# Usage:
#   bash scripts/piclaw/ssh-remote-install-piclaw.sh gan12003@deagent01.fritz.box
#
# Optional env:
#   PICLAW_RUNTIME_BRANCH=deagent01-runtime   (falls back to main if missing on origin)
#   PICLAW_REPO_SSH=git@github.com-piclaw:GAN12003/openclaw-1.git
#   PICLAW_PI_ENV_FILE=/path/to/pi.env       (scp to /opt/piclaw/.env after install; not committed)
#
# Prereqs on the Pi: deploy key keypairs in ~/.ssh/ (see GITHUB-AGENTS.md) and keys added on GitHub.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET="${1:-${PICLAW_SSH_TARGET:?usage: $0 user@host}}"
REPO_URL="${PICLAW_REPO_SSH:-git@github.com-piclaw:GAN12003/openclaw-1.git}"
# Default main until per-agent branches exist on origin; override e.g. PICLAW_RUNTIME_BRANCH=deagent01-runtime
RUNTIME_BRANCH="${PICLAW_RUNTIME_BRANCH:-main}"

echo "[ssh-install] Target: $TARGET"
scp -q "$SCRIPT_DIR/pi-ssh-github-snippet.conf" "$TARGET:~/piclaw-ssh-github-snippet.conf"
scp -q "$SCRIPT_DIR/install-pi.sh" "$TARGET:~/install-piclaw.sh"

ssh -o BatchMode=yes "$TARGET" bash -s <<REMOTE
set -euo pipefail
mkdir -p "\$HOME/.ssh"
chmod 700 "\$HOME/.ssh"
if ! grep -q "Host github.com-piclaw" "\$HOME/.ssh/config" 2>/dev/null; then
  cat "\$HOME/piclaw-ssh-github-snippet.conf" >> "\$HOME/.ssh/config"
  echo "[ssh-install] Appended GitHub host aliases to ~/.ssh/config"
else
  echo "[ssh-install] ~/.ssh/config already has github.com-piclaw"
fi
rm -f "\$HOME/piclaw-ssh-github-snippet.conf"
touch "\$HOME/.ssh/known_hosts"
chmod 600 "\$HOME/.ssh/known_hosts" 2>/dev/null || true
if ! grep -q "github.com" "\$HOME/.ssh/known_hosts" 2>/dev/null; then
  ssh-keyscan -H github.com >> "\$HOME/.ssh/known_hosts" 2>/dev/null || true
  echo "[ssh-install] Added github.com to known_hosts"
fi
chmod +x "\$HOME/install-piclaw.sh"
export PICLAW_REPO_SSH="$REPO_URL"
export PICLAW_RUNTIME_BRANCH="$RUNTIME_BRANCH"
bash "\$HOME/install-piclaw.sh"
REMOTE

if [[ -n "${PICLAW_PI_ENV_FILE:-}" && -f "$PICLAW_PI_ENV_FILE" ]]; then
  echo "[ssh-install] Installing .env from PICLAW_PI_ENV_FILE"
  scp -q "$PICLAW_PI_ENV_FILE" "$TARGET:/tmp/piclaw.env.remote"
  ssh -o BatchMode=yes "$TARGET" "sudo mv /tmp/piclaw.env.remote /opt/piclaw/.env && sudo chown \$(id -un):\$(id -gn) /opt/piclaw/.env && chmod 600 /opt/piclaw/.env && sudo systemctl restart piclaw.service"
else
  echo "[ssh-install] Skipping .env (set PICLAW_PI_ENV_FILE to a Pi-ready file to upload)"
fi

echo "[ssh-install] Done. On the Pi: edit /opt/piclaw/.env (token, OPENAI_API_KEY, PICLAW_TELEGRAM_CHAT_ID), then:"
echo "  sudo systemctl restart piclaw.service && sudo systemctl --no-pager -l status piclaw.service | head -25"
