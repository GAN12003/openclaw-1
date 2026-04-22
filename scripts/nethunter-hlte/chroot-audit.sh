#!/usr/bin/env bash
# Run inside NetHunter Kali (e.g. bootkali) on hlte. Read-only health + size report.
set -euo pipefail

echo "=== nethunter chroot audit ==="
date -u
echo

echo "=== kernel / userland ==="
uname -a 2>/dev/null || true
if [[ -f /etc/os-release ]]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  echo "PRETTY_NAME=${PRETTY_NAME:-?}"
fi
echo

echo "=== dpkg / apt sanity ==="
dpkg --audit 2>/dev/null | sed -n '1,40p' || true
if command -v apt-get >/dev/null 2>&1; then
  apt-get check 2>&1 | sed -n '1,40p' || true
fi
echo

echo "=== package counts ==="
dpkg -l 2>/dev/null | tail -n +6 | wc -l | awk '{print "installed dpkg lines:", $1}'
if command -v apt-mark >/dev/null 2>&1; then
  echo -n "manual: "
  apt-mark showmanual 2>/dev/null | wc -l
fi
echo

echo "=== disk (mounts) ==="
df -hP 2>/dev/null | sed -n '1,20p' || true
echo

echo "=== apt cache size ==="
du -sh /var/cache/apt/archives 2>/dev/null || echo "(no apt cache dir?)"
echo

echo "=== largest installed packages (Installed-Size, KiB) ==="
if command -v dpkg-query >/dev/null 2>&1; then
  dpkg-query -Wf '${Installed-Size}\t${Package}\n' 2>/dev/null | sort -n | tail -n 30 | while read -r size name; do
    if [[ -n "${size// /}" ]]; then
      printf "%10s  %s\n" "$size" "$name"
    fi
  done
fi
echo

echo "=== services (if systemd present) ==="
if command -v systemctl >/dev/null 2>&1; then
  systemctl list-unit-files 2>/dev/null | head -n 5 || true
  echo "… (chroots often have non-functional systemd; noise is normal)"
else
  echo "no systemctl in PATH (common in chroot)"
fi
