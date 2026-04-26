"use strict";

const identityBridge = require("../identity_bridge");
const notifierClient = require("../comms/notifier_client");

const recent = new Map();

function nowIso() {
  return new Date().toISOString();
}

function makeKey(ev) {
  return `${ev.topic || "general"}::${ev.dedupe_key || ev.summary || ""}`;
}

function shouldDrop(ev) {
  const key = makeKey(ev);
  const cooldownMs = Math.max(1000, Number(process.env.PICLAW_EVENT_DEDUPE_MS || 60000) || 60000);
  const at = recent.get(key) || 0;
  if (Date.now() - at < cooldownMs) return true;
  recent.set(key, Date.now());
  return false;
}

function normalize(raw) {
  const host = process.env.PICLAW_NOTIFIER_AGENT_ID || process.env.HOSTNAME || "piclaw";
  return {
    ts: nowIso(),
    schema_version: 1,
    agent_id: String(host),
    severity: String(raw && raw.severity ? raw.severity : process.env.PICLAW_NOTIFIER_DEFAULT_SEVERITY || "info"),
    topic: String((raw && raw.topic) || "general"),
    summary: String((raw && raw.summary) || ""),
    details: raw && raw.details && typeof raw.details === "object" ? raw.details : {},
    dedupe_key: String((raw && raw.dedupe_key) || ""),
  };
}

function emit(raw) {
  const ev = normalize(raw);
  if (shouldDrop(ev)) return { ok: true, deduped: true };
  try {
    identityBridge.appendLedgerLine({ type: "event", ...ev });
  } catch (_) {}
  try {
    notifierClient.enqueueEvent(ev);
  } catch (_) {}
  return { ok: true, deduped: false };
}

module.exports = { emit, normalize };
