#!/usr/bin/env bash
set -euo pipefail
SSID="${PICLAW_AP_SSID:-PiclawLabAP}"
PASS="${PICLAW_AP_PASSPHRASE:-PiclawLab12345}"
CHAN="${PICLAW_AP_CHANNEL:-6}"
SUBNET="${PICLAW_AP_SUBNET:-10.77.0.1/24}"
sudo ip link set wlan1 down || true
sudo ip addr flush dev wlan1 || true
sudo ip addr add "$SUBNET" dev wlan1
sudo ip link set wlan1 up
cat <<EOF | sudo tee /etc/hostapd/hostapd.conf >/dev/null
interface=wlan1
driver=nl80211
ssid=${SSID}
hw_mode=g
channel=${CHAN}
wpa=2
wpa_passphrase=${PASS}
EOF
echo "wlan1 AP configured"
