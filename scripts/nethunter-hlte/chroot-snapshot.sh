#!/usr/bin/env bash
# Run inside Kali (bootkali) before any removals. No packages changed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
OUT_ROOT="${CHROOT_SNAPSHOT_DIR:-$SCRIPT_DIR/snapshots}"
OUT="${OUT_ROOT}/${STAMP}"
mkdir -p "$OUT"

dpkg --get-selections >"$OUT/dpkg-selections.txt"
dpkg -l >"$OUT/dpkg-l.txt" 2>/dev/null || true
if command -v apt-mark >/dev/null 2>&1; then
  apt-mark showmanual >"$OUT/apt-mark-manual.txt" 2>/dev/null || true
  apt-mark showauto >"$OUT/apt-mark-auto.txt" 2>/dev/null || true
fi
if [[ -f /etc/os-release ]]; then
  cp /etc/os-release "$OUT/" 2>/dev/null || true
fi
for f in /etc/apt/sources.list /etc/apt/sources.list.d /etc/apt/preferences.d; do
  if [[ -e $f ]]; then
    cp -a "$f" "$OUT/" 2>/dev/null || true
  fi
done

{
  date -u
  df -hP 2>/dev/null
} >"$OUT/df.txt" 2>/dev/null || true
if command -v free >/dev/null 2>&1; then
  free -h 2>/dev/null >"$OUT/free.txt" 2>/dev/null || true
fi

echo "Snapshot written to: $OUT"
du -sh "$OUT" 2>/dev/null || true
