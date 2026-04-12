#!/usr/bin/env bash
# Run on a Pi after git pull on your runtime branch. Syncs piclaw_runtime -> /opt/piclaw (keeps .env + node_modules strategy).
set -euo pipefail

REPO_ROOT="${1:?Usage: $0 /path/to/openclaw-1}"
RUNTIME_BRANCH="${2:?Usage: $0 repo_path branch_name e.g. deagent02-runtime}"

cd "$REPO_ROOT"
git fetch origin
git checkout "$RUNTIME_BRANCH"
git pull origin "$RUNTIME_BRANCH"

rsync -a --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude state.json \
  ./piclaw_runtime/ /opt/piclaw/

cd /opt/piclaw
npm install --omit=dev

sudo systemctl restart piclaw
sudo systemctl --no-pager -l status piclaw | head -20
