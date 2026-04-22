#!/usr/bin/env bash
# Run after removals: repair dpkg, fix deps, autoremove, clear apt cache. Safe to re-run.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

set +e
dpkg --configure -a
status_dpkg=$?
set -e

apt-get -f -y install
apt-get -y autoremove --purge
if command -v apt-get >/dev/null 2>&1; then
  apt-get clean
fi

if [[ "$status_dpkg" -ne 0 ]]; then
  echo "Note: dpkg --configure -a had non-zero exit; check output above and run again or inspect: dpkg --audit" >&2
fi

echo "chroot-cleanup-finish: done. Run: ./chroot-audit.sh"
