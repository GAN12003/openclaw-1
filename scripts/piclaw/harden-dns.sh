#!/usr/bin/env bash
set -euo pipefail

CON_NAME="${PICLAW_WIFI_CONNECTION_NAME:-FRITZ!Box 6690 RB_IoT}"
DNS_SERVERS="${PICLAW_DNS_SERVERS:-1.1.1.1 8.8.8.8}"

echo "[dns] connection=${CON_NAME}"
echo "[dns] servers=${DNS_SERVERS}"

nmcli con show "${CON_NAME}" >/dev/null
sudo nmcli con mod "${CON_NAME}" ipv4.ignore-auto-dns yes
sudo nmcli con mod "${CON_NAME}" ipv4.dns "${DNS_SERVERS}"
sudo nmcli con down "${CON_NAME}" || true
sudo nmcli con up "${CON_NAME}"

echo "[dns] status:"
resolvectl status | sed -n '1,80p' || true

echo "[dns] probe:"
getent hosts api.telegram.org || true
getent hosts integrate.api.nvidia.com || true
echo "[dns] done"
