#!/usr/bin/env bash
# Writes the N largest installed packages (by dpkg Installed-Size) for review; no removals.
# Copy names you want into a custom .list, or add as comments to packages-minimal.list.
# Usage: ./chroot-export-top-packages.sh [N]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
N="${1:-50}"
OUT_ROOT="${CHROOT_EXPORT_DIR:-$SCRIPT_DIR/snapshots}"
mkdir -p "$OUT_ROOT"
OUT="${CHROOT_EXPORT_OUT:-$OUT_ROOT/last-top-packages.txt}"

if ! command -v dpkg-query >/dev/null 2>&1; then
  echo "dpkg-query not found" >&2
  exit 1
fi

{
  echo "# top ${N} packages by Installed-Size (KiB) — ${OUT}"
  date -u
  echo "# one package per line; # lines and trailing comments ignored by chroot-minimize"
  dpkg-query -Wf '${Installed-Size}\t${Package}\n' 2>/dev/null | sort -n | tail -n "$N" | while IFS= read -r size name; do
    size="${size// /}"
    if [[ -n "$name" && -n "$size" ]]; then
      echo "${name}  # Installed-Size_kib=${size}"
    fi
  done
} > "$OUT"

echo "Wrote: $OUT"
echo "--- (last 15 lines) ---"
tail -n 15 "$OUT"
