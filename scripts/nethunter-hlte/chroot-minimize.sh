#!/usr/bin/env bash
# Run inside NetHunter Kali (bootkali). Removes packages from a list file.
# Defaults: dry-run (no changes), profile safe.
#
# Usage:
#   ./chroot-minimize.sh
#   ./chroot-minimize.sh --profile safe|minimal
#   ./chroot-minimize.sh --list /path/to/list
#   ./chroot-minimize.sh --profile minimal --apply
#   CHROOT_MINIMIZE_LIST=/path ./chroot-minimize.sh --apply
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIST_FILE="${CHROOT_MINIMIZE_LIST:-}"
APPLY=0

usage() {
  echo "Usage: $0 [--profile safe|minimal] [--list path] [--apply]" >&2
  echo "  Default profile: safe ($SCRIPT_DIR/packages-headless-remove.list)" >&2
  echo "  Env: CHROOT_MINIMIZE_LIST=path, CHROOT_MINIMIZE_APPLY=1" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --list)
      if [[ -z "${2:-}" ]]; then
        echo "missing value for --list" >&2
        exit 1
      fi
      LIST_FILE="$2"
      shift 2
      ;;
    --profile)
      if [[ -z "${2:-}" ]]; then
        echo "missing value for --profile" >&2
        exit 1
      fi
      case "$2" in
        safe)
          LIST_FILE="$SCRIPT_DIR/packages-headless-remove.list"
          ;;
        minimal)
          LIST_FILE="$SCRIPT_DIR/packages-minimal.list"
          ;;
        *)
          echo "unknown --profile: $2 (use safe or minimal)" >&2
          exit 1
          ;;
      esac
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "${CHROOT_MINIMIZE_APPLY:-0}" == "1" ]]; then
  APPLY=1
fi

if [[ -z "$LIST_FILE" ]]; then
  LIST_FILE="$SCRIPT_DIR/packages-headless-remove.list"
fi

if [[ ! -f "$LIST_FILE" ]]; then
  echo "missing list: $LIST_FILE" >&2
  exit 1
fi

to_remove=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  line="${line%%#*}"
  p="$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -z "$p" ]] && continue
  if dpkg -s "$p" >/dev/null 2>&1; then
    to_remove+=("$p")
  fi
done < "$LIST_FILE"

if [[ ${#to_remove[@]} -eq 0 ]]; then
  echo "No listed packages are installed; nothing to do."
  echo "(edit $LIST_FILE to match dpkg, or use --profile minimal after reviewing list.)"
  exit 0
fi

echo "=== list: $LIST_FILE ==="
echo "=== candidate removals (${#to_remove[@]} packages) ==="
printf ' %s\n' "${to_remove[@]}"
echo

if [[ "$APPLY" -ne 1 ]]; then
  echo "DRY-RUN: apt simulation only. To apply: $0 --profile <safe|minimal> --apply (or set CHROOT_MINIMIZE_APPLY=1 with CHROOT_MINIMIZE_LIST=...)"
  echo
  printf '%s\n' "${to_remove[@]}" | xargs -n 80 apt-get -s -y --no-install-recommends remove
  echo
  echo "DRY-RUN: autoremove/purge simulation"
  apt-get -s -y autoremove --purge
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
printf '%s\n' "${to_remove[@]}" | xargs -n 80 apt-get -y --no-install-recommends remove
apt-get -y autoremove --purge
if command -v apt-get >/dev/null 2>&1; then
  apt-get clean
fi

echo
echo "Done. Run ./chroot-cleanup-finish.sh and ./chroot-audit.sh if you want a repair pass and before/after stats."
