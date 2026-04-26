#!/usr/bin/env bash
# Pull current runtime branch in PICLAW_GIT_CLONE_ROOT, rsync piclaw_runtime -> /opt/piclaw, npm install, restart piclaw.
# Intended to be run by the same user as the piclaw service (often NOPASSWD sudo for systemctl only).
set -euo pipefail
CLONE="${PICLAW_GIT_CLONE_ROOT:-$HOME/src/openclaw-1}"
RUNTIME="${PICLAW_RUNTIME_INSTALL:-/opt/piclaw}"

phase() {
  echo "PICLAW_UPDATE_PHASE=$1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "PICLAW_UPDATE_ERROR=missing_command:$1"
    exit 20
  }
}

phase "PRECHECK"
require_cmd git
require_cmd rsync
require_cmd npm
require_cmd sudo
if [[ ! -d "$CLONE/.git" ]]; then
  echo "PICLAW_UPDATE_ERROR=clone_missing:$CLONE"
  exit 21
fi
if [[ ! -d "$RUNTIME" ]]; then
  echo "PICLAW_UPDATE_ERROR=runtime_missing:$RUNTIME"
  exit 22
fi
cd "$CLONE"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
echo "PICLAW_UPDATE_BRANCH=${branch}"
echo "PICLAW_UPDATE_UPSTREAM=${upstream:-none}"
if [[ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
  echo "PICLAW_UPDATE_ERROR=dirty_worktree"
  exit 23
fi

phase "FETCH"
git fetch --prune origin
phase "PULL"
git pull --ff-only
phase "SYNC"
rsync -a --delete \
  --exclude ".env" \
  --exclude "node_modules" \
  --exclude ".boot-ok" \
  --exclude "heartbeat.json" \
  --exclude "state.json" \
  piclaw_runtime/ "$RUNTIME/"
cd "$RUNTIME"
phase "NPM"
npm install --omit=dev
phase "RESTART"
sudo systemctl restart piclaw
phase "COMPLETE"
echo "agent-runtime-update: done"
