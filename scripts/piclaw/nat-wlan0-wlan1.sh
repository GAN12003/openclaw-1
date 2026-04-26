#!/usr/bin/env bash
set -euo pipefail
sudo sysctl -w net.ipv4.ip_forward=1
sudo iptables -t nat -C POSTROUTING -o wlan0 -j MASQUERADE 2>/dev/null || sudo iptables -t nat -A POSTROUTING -o wlan0 -j MASQUERADE
sudo iptables -C FORWARD -i wlan0 -o wlan1 -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || sudo iptables -A FORWARD -i wlan0 -o wlan1 -m state --state RELATED,ESTABLISHED -j ACCEPT
sudo iptables -C FORWARD -i wlan1 -o wlan0 -j ACCEPT 2>/dev/null || sudo iptables -A FORWARD -i wlan1 -o wlan0 -j ACCEPT
echo "NAT wlan1 -> wlan0 ready"
