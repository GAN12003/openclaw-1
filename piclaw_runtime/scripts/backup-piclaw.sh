#!/usr/bin/env bash
#
# Optional tarball backup of Piclaw runtime, identity, and optional workspace.
# Intended for Raspberry Pi / Linux. Run via cron or systemd timer (see DEPLOY.md).
#
# Environment (override as needed):
#   PICLAW_BACKUP_DIR   — destination directory (default: /var/backups/piclaw)
#   PICLAW_RUNTIME_DIR  — runtime root, e.g. /opt/piclaw (default: /opt/piclaw)
#   PICLAW_IDENTITY_DIR — identity dir (default: /opt/piclaw_identity)
#   PICLAW_WORKSPACE_DIR — optional extra path to include (unset = skip)
#   PICLAW_BACKUP_KEEP  — keep at most this many archives in BACKUP_DIR (default: 14)
#
set -euo pipefail

BACKUP_DIR="${PICLAW_BACKUP_DIR:-/var/backups/piclaw}"
RUNTIME="${PICLAW_RUNTIME_DIR:-/opt/piclaw}"
IDENT="${PICLAW_IDENTITY_DIR:-/opt/piclaw_identity}"
KEEP="${PICLAW_BACKUP_KEEP:-14}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/piclaw-backup-${TS}.tar.gz"

mkdir -p "${BACKUP_DIR}"

if [[ ! -d "${RUNTIME}" ]]; then
  echo "error: PICLAW_RUNTIME_DIR not a directory: ${RUNTIME}" >&2
  exit 1
fi

INCLUDE=( -C "$(dirname "${RUNTIME}")" "$(basename "${RUNTIME}")" )
if [[ -d "${IDENT}" ]]; then
  INCLUDE+=( -C "$(dirname "${IDENT}")" "$(basename "${IDENT}")" )
fi
if [[ -n "${PICLAW_WORKSPACE_DIR:-}" && -d "${PICLAW_WORKSPACE_DIR}" ]]; then
  INCLUDE+=( -C "$(dirname "${PICLAW_WORKSPACE_DIR}")" "$(basename "${PICLAW_WORKSPACE_DIR}")" )
fi

tar -czf "${OUT}" "${INCLUDE[@]}"
echo "wrote ${OUT}"

# Prune old archives (same naming prefix)
if [[ "${KEEP}" =~ ^[0-9]+$ ]] && [[ "${KEEP}" -gt 0 ]]; then
  ls -1t "${BACKUP_DIR}"/piclaw-backup-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r f; do
    [[ -n "${f}" ]] || continue
    rm -f "${f}"
    echo "removed old backup ${f}"
  done
fi
