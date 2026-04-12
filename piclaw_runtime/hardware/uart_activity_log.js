"use strict";

/**
 * Optional rate-limited NDJSON log for UART byte activity (same pattern as GPIO log).
 *
 * - PICLAW_UART_ACTIVITY_LOG_ENABLE=1 (default 0 — off to avoid noisy disks).
 * - PICLAW_UART_ACTIVITY_LOG_PATH — relative to runtime root (default logs/uart-activity.ndjson).
 * - PICLAW_UART_ACTIVITY_LOG_MIN_SEC — min seconds between lines (default 60).
 * - PICLAW_UART_ACTIVITY_LOG_MAX_BYTES — truncate when exceeded (default 5 MiB).
 */

const fs = require("fs");
const path = require("path");
const { SAFE_ROOT, isPathSafe } = require("../core/self_guard");

const LOG_REL_DEFAULT = path.join("logs", "uart-activity.ndjson");

function envBool(key, defaultVal) {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultVal;
  return !/^(0|false|no|off)$/i.test(String(v).trim());
}

function envNum(key, defaultVal) {
  const n = parseFloat(process.env[key]);
  return Number.isFinite(n) ? n : defaultVal;
}

function resolveLogPath() {
  const raw = (process.env.PICLAW_UART_ACTIVITY_LOG_PATH || "").trim();
  const rel = raw || LOG_REL_DEFAULT;
  const full = path.resolve(SAFE_ROOT, rel);
  if (!isPathSafe(full)) return null;
  return full;
}

let lastAppendWallMs = 0;

/**
 * @param {{ device: string, cumulativeBytes: number }} info
 */
function maybeAppendUartActivity(info) {
  if (!envBool("PICLAW_UART_ACTIVITY_LOG_ENABLE", false)) return;
  const logPath = resolveLogPath();
  if (!logPath || !info || typeof info.cumulativeBytes !== "number") return;

  const minSec = Math.max(5, envNum("PICLAW_UART_ACTIVITY_LOG_MIN_SEC", 60));
  const minMs = minSec * 1000;
  const now = Date.now();
  if (now - lastAppendWallMs < minMs) return;
  lastAppendWallMs = now;

  const maxBytes = Math.max(64 * 1024, envNum("PICLAW_UART_ACTIVITY_LOG_MAX_BYTES", 5 * 1024 * 1024));
  try {
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    if (fs.existsSync(logPath)) {
      const st = fs.statSync(logPath);
      if (st.size > maxBytes) fs.writeFileSync(logPath, "", "utf8");
    }
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      type: "uart_activity",
      device: info.device || null,
      cumulative_bytes: info.cumulativeBytes,
    });
    fs.appendFileSync(logPath, line + "\n", "utf8");
  } catch (_) {}
}

module.exports = { maybeAppendUartActivity, LOG_REL_DEFAULT };
