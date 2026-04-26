#!/usr/bin/env bash
# Install + bring up Tailscale on this Pi using PICLAW_TAILSCALE_AUTHKEY from env.
#
# Idempotent: if tailscale is already authenticated, just reports status.
# Designed to be invoked by the runtime over Telegram (/install_tailscale).
# After Tailscale is up, the auth key is no longer needed; the runtime
# clears PICLAW_TAILSCALE_AUTHKEY from .env on success.
#
# Output: human-readable lines plus machine-parseable KEY=value lines:
#   TAILSCALE_INSTALLED=1
#   TAILSCALE_IP4=100.x.y.z
#   TAILSCALE_IP6=fd7a:...
#   TAILSCALE_HOSTNAME=deagent04
#   TAILSCALE_STATE=Running
#
# Exit codes:
#   0  ok (installed and up, or already up)
#   2  PICLAW_TAILSCALE_AUTHKEY missing and tailscale not yet authenticated
#   3  install failed
#   4  tailscale up failed

set -uo pipefail

log()  { echo "[install-tailscale] $*"; }
emit() { echo "$*"; }

AUTHKEY="${PICLAW_TAILSCALE_AUTHKEY:-}"
HN="$(hostname | tr '[:upper:]' '[:lower:]')"

is_authenticated() {
  command -v tailscale >/dev/null 2>&1 || return 1
  local backend
  backend="$(tailscale status --json 2>/dev/null | sed -n 's/.*"BackendState":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
  [[ "$backend" == "Running" || "$backend" == "Starting" ]]
}

report_status() {
  local ip4 ip6 backend
  ip4="$(tailscale ip -4 2>/dev/null | head -n1 || true)"
  ip6="$(tailscale ip -6 2>/dev/null | head -n1 || true)"
  backend="$(tailscale status --json 2>/dev/null | sed -n 's/.*"BackendState":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
  emit "TAILSCALE_INSTALLED=1"
  emit "TAILSCALE_HOSTNAME=${HN}"
  emit "TAILSCALE_IP4=${ip4}"
  emit "TAILSCALE_IP6=${ip6}"
  emit "TAILSCALE_STATE=${backend:-unknown}"
  if [[ -n "$ip4" ]]; then
    log "SSH ready: ssh ${USER:-$(id -un)}@${ip4}"
  fi
}

if is_authenticated; then
  log "tailscale already authenticated, reporting status"
  report_status
  exit 0
fi

if [[ -z "$AUTHKEY" ]]; then
  log "ERROR: PICLAW_TAILSCALE_AUTHKEY not set and tailscale not authenticated"
  log "Set it via Telegram: /set_key PICLAW_TAILSCALE_AUTHKEY then send the tskey-auth-... value"
  exit 2
fi

if ! command -v tailscale >/dev/null 2>&1; then
  log "tailscale not found, installing via official script"
  if ! curl -fsSL https://tailscale.com/install.sh | sh; then
    log "ERROR: tailscale install failed"
    exit 3
  fi
else
  log "tailscale already installed: $(tailscale version 2>/dev/null | head -n1)"
fi

if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable --now tailscaled >/dev/null 2>&1 || true
fi

log "running: tailscale up --ssh --hostname=${HN} --accept-routes=false"
if ! sudo tailscale up \
  --authkey="$AUTHKEY" \
  --ssh \
  --hostname="$HN" \
  --accept-routes=false; then
  log "ERROR: tailscale up failed"
  exit 4
fi

# Brief settle so the IP is assigned before we read it.
sleep 2
report_status
exit 0
