#!/usr/bin/env node
/**
 * Daily rollups: host-health NDJSON (CPU, RAM, connectivity latency, Piclaw RSS/heap, UART/GPIO counters)
 * plus ledger openai_chat tokens and request duration_ms when present.
 * Run on the Pi from piclaw_runtime: node scripts/resource-report.js
 *
 * Paths: SAFE_ROOT = parent of this script (piclaw_runtime). Override identity with PICLAW_IDENTITY_PATH.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const SAFE_ROOT = path.join(__dirname, "..");
const LOG_DIR = path.join(SAFE_ROOT, "logs");

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

function loadHostSamples(files) {
  const samples = [];
  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch (_) {
      continue;
    }
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        samples.push(JSON.parse(line));
      } catch (_) {}
    }
  }
  samples.sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));
  return samples;
}

function dayKeyFromTs(ts) {
  if (!ts || typeof ts !== "string") return null;
  const d = ts.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function median(nums) {
  const arr = nums.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (arr.length === 0) return null;
  arr.sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

async function loadLedgerTokenByDay() {
  const ledgerPath = path.join(identityRoot(), "ledger.jsonl");
  const byDay = new Map();
  if (!fs.existsSync(ledgerPath)) {
    return { byDay, ledgerPath, ok: false };
  }
  const rl = readline.createInterface({
    input: fs.createReadStream(ledgerPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch (_) {
      continue;
    }
    if (o.type !== "openai_chat") continue;
    const dk = dayKeyFromTs(o.ts);
    if (!dk) continue;
    const cur = byDay.get(dk) || { calls: 0, prompt: 0, completion: 0, total: 0, durations: [] };
    if (!Array.isArray(cur.durations)) cur.durations = [];
    cur.calls += 1;
    if (typeof o.prompt_tokens === "number") cur.prompt += o.prompt_tokens;
    if (typeof o.completion_tokens === "number") cur.completion += o.completion_tokens;
    if (typeof o.total_tokens === "number") cur.total += o.total_tokens;
    if (typeof o.duration_ms === "number" && Number.isFinite(o.duration_ms)) cur.durations.push(o.duration_ms);
    byDay.set(dk, cur);
  }
  return { byDay, ledgerPath, ok: true };
}

function aggregateHostByDay(samples) {
  const byDay = new Map();
  for (const s of samples) {
    const dk = dayKeyFromTs(s.ts);
    if (!dk) continue;
    let bucket = byDay.get(dk);
    if (!bucket) {
      bucket = { cpu: [], mem: [], rss: [], heap: [], latency: [], n: 0 };
      byDay.set(dk, bucket);
    }
    bucket.n += 1;
    if (typeof s.cpuLoadPct === "number") bucket.cpu.push(s.cpuLoadPct);
    if (typeof s.memPct === "number") bucket.mem.push(s.memPct);
    if (typeof s.processRssMb === "number") bucket.rss.push(s.processRssMb);
    if (typeof s.processHeapUsedMb === "number") bucket.heap.push(s.processHeapUsedMb);
    if (typeof s.connectivityLatencyMs === "number") bucket.latency.push(s.connectivityLatencyMs);
  }
  return byDay;
}

function fmtMed(x) {
  if (x == null || !Number.isFinite(x)) return "n/a";
  return String(Math.round(x * 10) / 10);
}

async function main() {
  const files = listHostHealthFiles();
  const samples = loadHostSamples(files);
  const hostByDay = aggregateHostByDay(samples);
  const { byDay: tokenByDay, ledgerPath, ok: ledgerOk } = await loadLedgerTokenByDay();

  const days = new Set([...hostByDay.keys(), ...tokenByDay.keys()]);
  const sortedDays = [...days].sort();

  console.log("Piclaw resource report (UTC days)");
  console.log(`SAFE_ROOT=${SAFE_ROOT}`);
  console.log(`Ledger: ${ledgerPath} (${ledgerOk ? "read" : "missing"})`);
  console.log(
    `Host log files: ${files.length} (${files.map((f) => path.basename(f)).join(", ") || "none"})`
  );
  console.log("");

  if (sortedDays.length === 0) {
    console.log("No data.");
    process.exit(0);
  }

  const header =
    "day        samples cpu%_med mem%_med lat_ms_med rssMB_med heapMB_med  tok_calls  total_tok chat_ms_med";
  console.log(header);
  console.log("-".repeat(Math.max(80, header.length)));

  for (const d of sortedDays) {
    const h = hostByDay.get(d);
    const t = tokenByDay.get(d);
    const chatDurMed =
      t && Array.isArray(t.durations) && t.durations.length ? median(t.durations) : null;
    const row = [
      d,
      h ? String(h.n) : "0",
      fmtMed(h ? median(h.cpu) : null),
      fmtMed(h ? median(h.mem) : null),
      fmtMed(h ? median(h.latency) : null),
      fmtMed(h ? median(h.rss) : null),
      fmtMed(h ? median(h.heap) : null),
      t ? String(t.calls) : "0",
      t ? String(t.total) : "0",
      fmtMed(chatDurMed),
    ];
    console.log(row.join("\t"));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
