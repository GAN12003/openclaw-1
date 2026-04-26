#!/usr/bin/env bash
set -euo pipefail
sudo ip link set wlan1 down || true
sudo iw dev wlan1 set type monitor
sudo ip link set wlan1 up
echo "wlan1 monitor mode enabled"
