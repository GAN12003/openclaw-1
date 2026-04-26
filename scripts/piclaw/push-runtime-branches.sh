#!/usr/bin/env bash
set -euo pipefail

# Push local main to all runtime branches used by deployed agents.
# Usage:
#   ./scripts/piclaw/push-runtime-branches.sh
#   ./scripts/piclaw/push-runtime-branches.sh --dry-run

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

SOURCE_BRANCH="main"
TARGET_BRANCHES=(
  "nethunter-hlte-chroot-minimal"
)

# Add any existing deagentNN-runtime branches automatically.
while IFS= read -r b; do
  [[ -n "$b" ]] && TARGET_BRANCHES+=("$b")
done < <(git for-each-ref --format='%(refname:short)' refs/remotes/origin | sed -n 's#^origin/\(deagent[0-9][0-9]-runtime\)$#\1#p' | sort -u)

echo "Source: ${SOURCE_BRANCH}"
echo "Targets:"
printf ' - %s\n' "${TARGET_BRANCHES[@]}"

for target in "${TARGET_BRANCHES[@]}"; do
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] git push origin ${SOURCE_BRANCH}:${target}"
  else
    echo "Pushing ${SOURCE_BRANCH} -> ${target}"
    git push origin "${SOURCE_BRANCH}:${target}"
  fi
done

echo "Done."
