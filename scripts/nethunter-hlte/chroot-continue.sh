#!/usr/bin/env bash
# Non-destructive "continue" run: optional snapshot, audit, both minimize dry-runs, top-packages export.
# No apt changes. Set CHROOT_CONTINUE_SKIP_SNAPSHOT=1 to skip a new snapshot.
# Optional: chroot-continue.sh --with-docs  (adds *-doc dry-run, can be long)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

WITH_DOCS=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-docs) WITH_DOCS=1; shift ;;
    -h | --help)
      echo "Usage: $0 [--with-docs]" >&2
      echo "  Env: CHROOT_CONTINUE_SKIP_SNAPSHOT=1" >&2
      exit 0
      ;;
    *) echo "unknown: $1" >&2; exit 1 ;;
  esac
done

if [[ "${CHROOT_CONTINUE_SKIP_SNAPSHOT:-0}" != "1" ]]; then
  echo ">>> chroot-snapshot.sh"
  ./chroot-snapshot.sh
  echo
else
  echo ">>> (skipped snapshot, CHROOT_CONTINUE_SKIP_SNAPSHOT=1)"
  echo
fi

echo ">>> chroot-audit.sh"
./chroot-audit.sh
echo

echo ">>> chroot-minimize.sh --profile safe  (DRY-RUN)"
./chroot-minimize.sh --profile safe
echo

echo ">>> chroot-minimize.sh --profile minimal  (DRY-RUN)"
./chroot-minimize.sh --profile minimal
echo

if [[ "$WITH_DOCS" -eq 1 ]]; then
  echo ">>> chroot-purge-docs-dry.sh  (DRY-RUN, may be long)"
  ./chroot-purge-docs-dry.sh
  echo
fi

echo ">>> chroot-export-top-packages.sh 50"
./chroot-export-top-packages.sh 50
echo

cat <<'EOF'
--- Next (manual) ---
1) If dry-runs look safe:  ./chroot-minimize.sh --profile safe --apply
2) Then:                  ./chroot-cleanup-finish.sh
3) Edit packages-minimal.list, then: ./chroot-minimize.sh --profile minimal --apply
4) Then:                  ./chroot-cleanup-finish.sh
5) Optional docs purge:  ./chroot-purge-docs-dry.sh  then  --apply
6) Re-audit:              ./chroot-audit.sh
See 00-RUN-ORDER.txt for full notes.
EOF
