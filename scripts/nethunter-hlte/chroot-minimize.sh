#!/usr/bin/env bash
# Run inside NetHunter Kali (bootkali). Removes optional headless-candidate packages
# listed in packages-headless-remove.list. Defaults to a simulation (no changes).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIST_FILE="${CHROOT_MINIMIZE_LIST:-$SCRIPT_DIR/packages-headless-remove.list}"

APPLY=0
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
fi
if [[ "${CHROOT_MINIMIZE_APPLY:-0}" == "1" ]]; then
  APPLY=1
fi

if [[ ! -f "$LIST_FILE" ]]; then
  echo "missing list: $LIST_FILE" >&2
  exit 1
fi

to_remove=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  # strip inline comments
  line="${line%%#*}"
  p="$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -z "$p" ]] && continue
  if dpkg -s "$p" >/dev/null 2>&1; then
    to_remove+=("$p")
  fi
done < "$LIST_FILE"

if [[ ${#to_remove[@]} -eq 0 ]]; then
  echo "No listed packages are installed; nothing to do."
  echo "(edit $LIST_FILE to match what dpkg actually has on this chroot.)"
  exit 0
fi

echo "=== candidate removals (${#to_remove[@]} packages) ==="
printf ' %s\n' "${to_remove[@]}"
echo

if [[ "$APPLY" -ne 1 ]]; then
  echo "DRY-RUN: showing apt simulation only. To apply, run: $0 --apply"
  echo "     or: CHROOT_MINIMIZE_APPLY=1 $0"
  echo
  apt-get -s -y --no-install-recommends remove "${to_remove[@]}"
  echo
  echo "DRY-RUN: autoremove/purge simulation"
  apt-get -s -y autoremove --purge
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get -y --no-install-recommends remove "${to_remove[@]}"
apt-get -y autoremove --purge
if command -v apt-get >/dev/null 2>&1; then
  apt-get clean
fi

echo
echo "Done. Re-run chroot-audit.sh and: dpkg --configure -a  (if anything looks stuck)."
