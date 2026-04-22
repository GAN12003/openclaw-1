#!/usr/bin/env bash
# Lists installed *-doc packages and simulates their removal. Phone chroots rarely need *-doc.
# Does not remove by default. Run with --apply to actually purge.
set -euo pipefail

to_remove=()
while IFS= read -r p; do
  [[ -n "$p" ]] && to_remove+=("$p")
done < <(dpkg-query -Wf '${Package}\n' 2>/dev/null | grep -E -- '-doc$' || true)

if [[ ${#to_remove[@]} -eq 0 ]]; then
  echo "No *-doc packages installed (or dpkg-query missing)."
  exit 0
fi

APPLY=0
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
fi

echo "=== *-doc packages (${#to_remove[@]}) ==="
printf ' %s\n' "${to_remove[@]}"
echo

if [[ "$APPLY" -ne 1 ]]; then
  echo "DRY-RUN: apt simulation only. To apply: $0 --apply"
  printf '%s\n' "${to_remove[@]}" | xargs -n 80 apt-get -s -y --no-install-recommends remove
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
printf '%s\n' "${to_remove[@]}" | xargs -n 80 apt-get -y --no-install-recommends remove
apt-get -y autoremove --purge
apt-get clean 2>/dev/null || true
