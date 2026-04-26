#!/usr/bin/env bash
set -euo pipefail
sudo apt-get update
sudo apt-get install -y firmware-realtek firmware-atheros aircrack-ng hostapd dnsmasq tcpdump
echo "usb wifi dependencies installed"
