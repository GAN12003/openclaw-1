"use strict";

const fs = require("fs");
const path = require("path");
const { SAFE_ROOT, isPathSafe } = require("../core/self_guard");

const LOG_REL_DEFAULT = path.join("logs", "gpio-state.ndjson");

function envBool(key, defaultVal) {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultVal;
  return !/^(0|false|no|off)$/i.test(String(v).trim());
}

function envNum(key, defaultVal) {
  const n = parseFloat(process.env[key]);
  return Number.isFinite(n) ? n : defaultVal;
}

/**
 * Resolve NDJSON log path under SAFE_ROOT. Optional PICLAW_GPIO_LOG_PATH is relative to runtime root.
 * @returns {string | null}
 */
function resolveLogPath() {
  const raw = (process.env.PICLAW_GPIO_LOG_PATH || "").trim();
  const rel = raw || LOG_REL_DEFAULT;
  const full = path.resolve(SAFE_ROOT, rel);
  if (!isPathSafe(full)) return null;
  return full;
}

function getLogSettings() {
  const logPath = resolveLogPath();
  const enabled = envBool("PICLAW_GPIO_LOG_ENABLE", true) && logPath != null;
  const maxBytes = Math.max(64, envNum("PICLAW_GPIO_LOG_MAX_BYTES", 5 * 1024 * 1024));
  return { enabled, maxBytes, logPath };
}

function appendGpioStateLog(record) {
  const { enabled, maxBytes, logPath } = getLogSettings();
  if (!enabled || !logPath) return;
  try {
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    if (fs.existsSync(logPath)) {
      const st = fs.statSync(logPath);
      if (st.size > maxBytes) fs.writeFileSync(logPath, "", "utf8");
    }
    fs.appendFileSync(logPath, JSON.stringify(record) + "\n", "utf8");
  } catch (_) {}
}

module.exports = { getLogSettings, appendGpioStateLog, LOG_REL_DEFAULT };
