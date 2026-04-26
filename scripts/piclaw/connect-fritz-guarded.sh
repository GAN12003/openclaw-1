#!/usr/bin/env bash
# Guarded Wi-Fi switch helper for deAgent nodes.
# Switches wlan0 to target SSID, verifies internet + tailscale, and rolls back on failure.
set -euo pipefail

SSID="${1:-}"
PSK="${2:-}"
IFACE="${PICLAW_WIFI_IFACE:-wlan0}"
ROLLBACK_SEC="${PICLAW_WIFI_ROLLBACK_SEC:-45}"

if [[ -z "$SSID" || -z "$PSK" ]]; then
  echo "usage: $0 <ssid> <password>"
  exit 2
fi

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: missing command: $1"
    exit 3
  }
}

need nmcli
need ip
need ping

echo "phase=precheck"
CUR_NAME="$(nmcli -t -f NAME,TYPE connection show --active | awk -F: '$2=="wifi"{print $1; exit}')"
if [[ -z "$CUR_NAME" ]]; then
  echo "error: no active wifi connection found"
  exit 4
fi
echo "active_wifi=${CUR_NAME}"

# Reuse existing profile or create one.
if nmcli -t -f NAME connection show | grep -Fxq "$SSID"; then
  echo "phase=profile:update"
  nmcli connection modify "$SSID" 802-11-wireless.ssid "$SSID" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PSK"
else
  echo "phase=profile:add"
  nmcli connection add type wifi ifname "$IFACE" con-name "$SSID" ssid "$SSID" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PSK"
fi

echo "phase=switch"
nmcli connection up "$SSID" ifname "$IFACE"
sleep 3

verify_online() {
  ping -c 1 -W 3 1.1.1.1 >/dev/null 2>&1 && return 0
  ping -c 1 -W 3 8.8.8.8 >/dev/null 2>&1 && return 0
  return 1
}

verify_tailscale() {
  if ! command -v tailscale >/dev/null 2>&1; then
    return 1
  fi
  local state
  state="$(tailscale status --json 2>/dev/null | sed -n 's/.*"BackendState":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
  [[ "$state" == "Running" ]]
}

echo "phase=verify"
deadline=$((SECONDS + ROLLBACK_SEC))
ok_online=0
ok_tail=0
while (( SECONDS < deadline )); do
  if verify_online; then ok_online=1; fi
  if verify_tailscale; then ok_tail=1; fi
  if [[ "$ok_online" -eq 1 && "$ok_tail" -eq 1 ]]; then
    break
  fi
  sleep 2
done

if [[ "$ok_online" -eq 1 && "$ok_tail" -eq 1 ]]; then
  ip4="$(ip -4 addr show dev "$IFACE" | awk '/inet /{print $2}' | head -n1)"
  echo "phase=complete"
  echo "connected_ssid=$SSID"
  echo "ip4=${ip4:-none}"
  echo "tailscale=running"
  exit 0
fi

echo "phase=rollback"
echo "warn: verification failed (online=${ok_online}, tailscale=${ok_tail}), rolling back to $CUR_NAME"
nmcli connection up "$CUR_NAME" ifname "$IFACE" || true
exit 10
