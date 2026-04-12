"use strict";

/**
 * Thresholded counters from ledger tail (type openai_chat) — cheap pattern hint file.
 * Env: PICLAW_PATTERN_STATS_ENABLE=1
 * Writes knowledge/pattern_stats.json
 */

const fs = require("fs");
const path = require("path");
const paths = require("../identity_bridge/paths");
const identityBridge = require("../identity_bridge");

function outPath() {
  return path.join(paths.getRoot(), "knowledge", "pattern_stats.json");
}

function envBool(key, def) {
  const v = process.env[key];
  if (v === undefined || v === "") return def;
  return !/^(0|false|no|off)$/i.test(String(v).trim());
}

const MIN_SAMPLES = 5;

/**
 * Scan last N lines of ledger for openai_chat rows; aggregate by UTC day.
 */
function refreshPatternStats() {
  if (!envBool("PICLAW_PATTERN_STATS_ENABLE", false)) return;
  if (!identityBridge.isAvailable()) return;
  const ledger = path.join(paths.getRoot(), "ledger.jsonl");
  if (!fs.existsSync(ledger)) return;
  let raw;
  try {
    raw = fs.readFileSync(ledger, "utf8");
  } catch (_) {
    return;
  }
  const lines = raw.split("\n").filter((l) => l.trim()).slice(-500);
  const byDay = {};
  for (const line of lines) {
    let o;
    try {
      o = JSON.parse(line);
    } catch (_) {
      continue;
    }
    if (o.type !== "openai_chat" || !o.ts) continue;
    const day = String(o.ts).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    byDay[day] = (byDay[day] || 0) + 1;
  }
  const days = Object.keys(byDay).sort();
  const total = Object.values(byDay).reduce((a, b) => a + b, 0);
  const payload = {
    updated_at: new Date().toISOString(),
    threshold_min_samples: MIN_SAMPLES,
    total_openai_chat_rows_sampled: total,
    by_day: byDay,
    note:
      total >= MIN_SAMPLES
        ? "Chat completions occurred on recorded days; not a guarantee of user habit patterns."
        : "Not enough samples for strong pattern claims.",
  };
  try {
    const dir = path.dirname(outPath());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath(), JSON.stringify(payload, null, 2), "utf8");
  } catch (_) {}
}

module.exports = { refreshPatternStats, outPath };
