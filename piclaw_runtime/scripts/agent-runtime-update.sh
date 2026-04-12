#!/usr/bin/env bash
# Pull current runtime branch in PICLAW_GIT_CLONE_ROOT, rsync piclaw_runtime -> /opt/piclaw, npm install, restart piclaw.
# Intended to be run by the same user as the piclaw service (often NOPASSWD sudo for systemctl only).
set -euo pipefail
CLONE="${PICLAW_GIT_CLONE_ROOT:-$HOME/src/openclaw-1}"
RUNTIME="${PICLAW_RUNTIME_INSTALL:-/opt/piclaw}"
cd "$CLONE"
git pull --ff-only
rsync -a --delete \
  --exclude ".env" \
  --exclude "node_modules" \
  --exclude ".boot-ok" \
  --exclude "heartbeat.json" \
  --exclude "state.json" \
  piclaw_runtime/ "$RUNTIME/"
cd "$RUNTIME"
npm install --omit=dev
sudo systemctl restart piclaw
echo "agent-runtime-update: done"
