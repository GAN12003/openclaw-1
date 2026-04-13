#!/usr/bin/env bash
# Roll Piclaw runtime to each Pi over SSH: git pull agent branch, rsync into /opt/piclaw, deps, restart.
#
# Usage (from a machine with SSH keys to the Pis):
#   export PICLAW_SSH_HOSTS="gan12003@deagent01 gan12003@deagent02 gan12003@deagent03"
#   export PICLAW_REPO_CLONE='/home/gan12003/src/openclaw-1'   # same on every host, or omit for default
#   bash scripts/piclaw/sync-piclaw-fleet.sh
#
# Branch: reads PICLAW_RUNTIME_BRANCH from the Pi's /opt/piclaw/.env (falls back to main).
# Preserves /opt/piclaw/.env and state.json. Appends PICLAW_TELEGRAM_GROUP_REPLY_MODE=mention if missing.

set -euo pipefail

HOSTS="${PICLAW_SSH_HOSTS:-}"

if [[ -z "$HOSTS" ]]; then
  echo "Set PICLAW_SSH_HOSTS to a space-separated list (e.g. user@host1 user@host2)." >&2
  exit 1
fi

for h in $HOSTS; do
  echo "========== $h =========="
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$h" \
    REPO_CLONE="${PICLAW_REPO_CLONE:-}" \
    bash -s <<'ENDSSH'
set -euo pipefail
REPO="${REPO_CLONE:-$HOME/src/openclaw-1}"
if [[ ! -d "$REPO/.git" ]]; then
  echo "error: no git repo at $REPO" >&2
  exit 1
fi
BR=main
if [[ -f /opt/piclaw/.env ]]; then
  line="$(grep -E '^[[:space:]]*PICLAW_RUNTIME_BRANCH=' /opt/piclaw/.env 2>/dev/null | tail -1 || true)"
  if [[ -n "$line" ]]; then
    BR="${line#*=}"
    BR="$(echo "$BR" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  fi
fi
[[ -z "$BR" ]] && BR=main
echo "[fleet] repo=$REPO branch=$BR"
git -C "$REPO" fetch origin
if git -C "$REPO" show-ref --verify --quiet "refs/remotes/origin/$BR"; then
  git -C "$REPO" checkout "$BR"
  git -C "$REPO" pull --ff-only origin "$BR" || true
else
  echo "[fleet] origin/$BR missing — staying on current branch, pulling"
  git -C "$REPO" pull --ff-only || true
fi
sudo mkdir -p /opt/piclaw
if [[ -f /opt/piclaw/.env ]]; then sudo cp -a /opt/piclaw/.env /tmp/piclaw.env.fleetsync; fi
if [[ -f /opt/piclaw/state.json ]]; then sudo cp -a /opt/piclaw/state.json /tmp/piclaw.state.fleetsync; fi
sudo rsync -a --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude state.json \
  "$REPO/piclaw_runtime/" /opt/piclaw/
if [[ -f /tmp/piclaw.env.fleetsync ]]; then sudo mv /tmp/piclaw.env.fleetsync /opt/piclaw/.env; fi
if [[ -f /tmp/piclaw.state.fleetsync ]]; then sudo mv /tmp/piclaw.state.fleetsync /opt/piclaw/state.json; fi
PIC_USER="$(stat -c '%U' /opt/piclaw 2>/dev/null || echo root)"
PIC_GROUP="$(stat -c '%G' /opt/piclaw 2>/dev/null || echo root)"
sudo chown -R "$PIC_USER:$PIC_GROUP" /opt/piclaw
cd /opt/piclaw
sudo -u "$PIC_USER" npm install --omit=dev
grep -qF PICLAW_TELEGRAM_GROUP_REPLY_MODE= /opt/piclaw/.env 2>/dev/null \
  || echo "PICLAW_TELEGRAM_GROUP_REPLY_MODE=mention" | sudo tee -a /opt/piclaw/.env >/dev/null
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-aiohttp python3-aiofiles python3-pip 2>/dev/null || true
if [[ -f /opt/piclaw/extensions/twitter_api/requirements.txt ]]; then
  sudo pip3 install --break-system-packages -q -r /opt/piclaw/extensions/twitter_api/requirements.txt 2>/dev/null \
    || sudo pip3 install -q -r /opt/piclaw/extensions/twitter_api/requirements.txt 2>/dev/null \
    || true
fi
sudo systemctl restart piclaw
sleep 2
sudo systemctl --no-pager -l is-active piclaw || true
ENDSSH
done
echo "[fleet] done"
