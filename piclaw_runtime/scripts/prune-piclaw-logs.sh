#!/usr/bin/env bash
#
# Delete Piclaw runtime log files older than PICLAW_LOG_RETENTION_DAYS under RUNTIME/logs only.
# Does not touch identity or workspace unless you explicitly extend this script.
#
# Environment:
#   PICLAW_RUNTIME_DIR       — default /opt/piclaw
#   PICLAW_LOG_RETENTION_DAYS — default 14
#
set -euo pipefail

RUNTIME="${PICLAW_RUNTIME_DIR:-/opt/piclaw}"
LOGDIR="${RUNTIME}/logs"
DAYS="${PICLAW_LOG_RETENTION_DAYS:-14}"

if [[ ! -d "${LOGDIR}" ]]; then
  echo "no logs dir: ${LOGDIR}"
  exit 0
fi

if ! [[ "${DAYS}" =~ ^[0-9]+$ ]] || [[ "${DAYS}" -lt 1 ]]; then
  echo "error: PICLAW_LOG_RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi

find "${LOGDIR}" -type f -mtime "+${DAYS}" -print -delete
echo "pruned files in ${LOGDIR} older than ${DAYS} days"
