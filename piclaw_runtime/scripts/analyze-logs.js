#!/usr/bin/env node
/**
 * Bounded summary of host-health NDJSON, identity ledger (openai_chat), and optional GPIO/UART logs.
 * Run: node scripts/analyze-logs.js
 *
 * Env: PICLAW_IDENTITY_PATH (default /opt/piclaw_identity), PICLAW_ANALYZE_MAX_HOST_LINES, PICLAW_ANALYZE_MAX_LEDGER_LINES
 */
"use strict";

const fs = require("fs");
const path = require("path");

const SAFE_ROOT = path.join(__dirname, "..");
const LOG_DIR = path.join(SAFE_ROOT, "logs");

function envNum(key, def) {
  const n = parseInt(process.env[key] || String(def), 10);
  return Number.isFinite(n) ? Math.max(1, n) : def;
}

function identityRoot() {
  return path.resolve(process.env.PICLAW_IDENTITY_PATH || "/opt/piclaw_identity");
}

function listHostHealthFiles() {
  if (!fs.existsSync(LOG_DIR)) return [];
  const names = fs.readdirSync(LOG_DIR);
  const out = [];
  for (const n of names) {
    if (n === "host-health.ndjson" || /^host-health-archive-\d+\.ndjson$/.test(n)) {
      out.push(path.join(LOG_DIR, n));
    }
  }
  out.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  return out;
}

/** @param {{ maxHostLines?: number, maxLedgerLines?: number, maxChars?: number }} [opts] */
function getLogsSummaryText(opts) {
  const maxHost = opts && opts.maxHostLines != null ? opts.maxHostLines : envNum("PICLAW_ANALYZE_MAX_HOST_LINES", 400);
  const maxLedger = opts && opts.maxLedgerLines != null ? opts.maxLedgerLines : envNum("PICLAW_ANALYZE_MAX_LEDGER_LINES", 600);
  const maxChars = opts && opts.maxChars != null ? opts.maxChars : 4000;

  const lines = [];
  const push = (s) => {
    lines.push(s);
  };

  push("Piclaw log summary (read-only)");
  push(`SAFE_ROOT=${SAFE_ROOT}`);
  push("");

  const hostFiles = listHostHealthFiles();
  const hostLines = [];
  for (const file of hostFiles) {
    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch (_) {
      continue;
    }
    const all = raw.split("\n").filter((l) => l.trim());
    for (const l of all) hostLines.push(l);
  }
  const tailHost = hostLines.slice(-maxHost);
  let hostParsed = 0;
  let hostOffline = 0;
  let latencies = [];
  let lastHost = null;
  for (const l of tailHost) {
    try {
      const o = JSON.parse(l);
      hostParsed++;
      if (o.online === false) hostOffline++;
      if (typeof o.connectivityLatencyMs === "number") latencies.push(o.connectivityLatencyMs);
      lastHost = o;
    } catch (_) {}
  }
  push(`[host-health] files=${hostFiles.length} tail_lines=${tailHost.length} parsed=${hostParsed} offline_samples=${hostOffline}`);
  if (latencies.length) {
    latencies.sort((a, b) => a - b);
    const mid = Math.floor(latencies.length / 2);
    const med = latencies.length % 2 ? latencies[mid] : (latencies[mid - 1] + latencies[mid]) / 2;
    push(`[host-health] connectivity_latency_ms median(last N)=${Math.round(med)} (n=${latencies.length})`);
  }
  if (lastHost && lastHost.ts) {
    push(
      `[host-health] last: ts=${lastHost.ts} online=${lastHost.online} cpu=${lastHost.cpuLoadPct ?? "n/a"}% mem=${lastHost.memPct ?? "n/a"}%`
    );
  }
  push("");

  const ledgerPath = path.join(identityRoot(), "ledger.jsonl");
  push(`[ledger] path=${ledgerPath}`);
  let chatRows = 0;
  const durations = [];
  let lastErr = null;
  if (fs.existsSync(ledgerPath)) {
    const tail = [];
    try {
      const raw = fs.readFileSync(ledgerPath, "utf8");
      const all = raw.split("\n").filter((l) => l.trim());
      for (const l of all.slice(-maxLedger)) tail.push(l);
    } catch (_) {
      push("[ledger] read error");
    }
    for (const l of tail) {
      let o;
      try {
        o = JSON.parse(l);
      } catch (_) {
        continue;
      }
      if (o.type === "openai_chat") {
        chatRows++;
        if (typeof o.duration_ms === "number") durations.push(o.duration_ms);
      }
      if (o.type === "error" || o.level === "error") lastErr = o;
    }
    push(`[ledger] openai_chat_rows_in_tail=${chatRows}`);
    if (durations.length) {
      durations.sort((a, b) => a - b);
      const mid = Math.floor(durations.length / 2);
      const med = durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;
      push(`[ledger] duration_ms median=${Math.round(med)} max=${Math.max(...durations)} (n=${durations.length})`);
    }
    if (lastErr) push(`[ledger] last_error_like_row=${JSON.stringify(lastErr).slice(0, 200)}`);
  } else {
    push("[ledger] file missing");
  }
  push("");

  const gpioLog = path.join(LOG_DIR, "gpio-state.ndjson");
  if (fs.existsSync(gpioLog)) {
    try {
      const st = fs.statSync(gpioLog);
      push(`[gpio log] ${gpioLog} size_bytes=${st.size}`);
    } catch (_) {}
  }
  const uartLog = path.join(LOG_DIR, "uart-activity.ndjson");
  if (fs.existsSync(uartLog)) {
    try {
      const st = fs.statSync(uartLog);
      push(`[uart log] ${uartLog} size_bytes=${st.size}`);
    } catch (_) {}
  }

  push("");
  push("Hint: full systemd logs: journalctl -u piclaw -n 200 --no-pager");

  let out = lines.join("\n");
  if (out.length > maxChars) out = out.slice(0, maxChars) + "\n…[truncated]";
  return out;
}

async function main() {
  console.log(getLogsSummaryText({}));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { getLogsSummaryText, listHostHealthFiles };
