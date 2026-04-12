"use strict";

/**
 * Rolling session summaries (identity knowledge/session_summaries.jsonl).
 * Env: PICLAW_SESSION_SUMMARY_ENABLE=1, PICLAW_SESSION_SUMMARY_MAX_LINES (default 200)
 */

const fs = require("fs");
const path = require("path");
const paths = require("../identity_bridge/paths");
const identityBridge = require("../identity_bridge");

function summaryPath() {
  return path.join(paths.getRoot(), "knowledge", "session_summaries.jsonl");
}

function envBool(key, def) {
  const v = process.env[key];
  if (v === undefined || v === "") return def;
  return !/^(0|false|no|off)$/i.test(String(v).trim());
}

function maxLines() {
  const n = parseInt(process.env.PICLAW_SESSION_SUMMARY_MAX_LINES || "200", 10);
  return Number.isFinite(n) ? Math.min(2000, Math.max(20, n)) : 200;
}

/**
 * Append one summary line (JSON object per line).
 * @param {{ chatId: string | number, summary: string, ts?: string }} rec
 */
function appendSummary(rec) {
  if (!envBool("PICLAW_SESSION_SUMMARY_ENABLE", false)) return;
  if (!identityBridge.isAvailable()) return;
  const s = (rec && rec.summary ? String(rec.summary) : "").trim();
  if (!s) return;
  const p = summaryPath();
  const dir = path.dirname(p);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
  const line = JSON.stringify({
    ts: rec.ts || new Date().toISOString(),
    chat_id: rec.chatId != null ? String(rec.chatId) : "",
    summary: s.slice(0, 4000),
  });
  try {
    fs.appendFileSync(p, line + "\n", "utf8");
    trimFile(p, maxLines());
  } catch (_) {}
}

function trimFile(p, max) {
  try {
    const raw = fs.readFileSync(p, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    if (lines.length <= max) return;
    const tail = lines.slice(-max);
    fs.writeFileSync(p, tail.join("\n") + "\n", "utf8");
  } catch (_) {}
}

/**
 * Last non-empty summary text for injection (short).
 */
function getLatestSummarySnippet(maxChars) {
  if (!envBool("PICLAW_SESSION_SUMMARY_ENABLE", false)) return "";
  if (!identityBridge.isAvailable()) return "";
  const mc = Math.min(2000, Math.max(100, maxChars || 800));
  try {
    const p = summaryPath();
    if (!fs.existsSync(p)) return "";
    const raw = fs.readFileSync(p, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return "";
    const last = lines[lines.length - 1];
    let o;
    try {
      o = JSON.parse(last);
    } catch (_) {
      return "";
    }
    const s = o.summary ? String(o.summary) : "";
    return s.length > mc ? s.slice(0, mc) + "…" : s;
  } catch (_) {
    return "";
  }
}

module.exports = { appendSummary, getLatestSummarySnippet, summaryPath };
