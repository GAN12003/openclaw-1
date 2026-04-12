"use strict";

const fs = require("fs");
const path = require("path");
const {
  selfPath,
  relationshipsPath,
  goalsPath,
  experiencesPath,
  experiencesRotatedPath,
  preferencesPath,
  metaPath,
  knowledgePath,
  goalHistoryPath,
  goalHistoryRotatedPath,
  lastReviewPath,
  lastReviewHashPath,
  suggestionsPath,
  intentionsPath,
  identityStatePath,
  experimentsPath,
  ledgerPath,
  codexCredentialsPath,
  uartRegistryPath,
  lastUartDecayPath,
  getRoot,
} = require("./paths");
const { withLock, identityDirExists } = require("./lock");
const {
  defaultMeta,
  defaultSelf,
  defaultGoals,
  defaultRelationships,
  defaultPreferences,
  defaultIdentityState,
  defaultExperiments,
} = require("./defaults");

const EXPERIENCES_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** fsync can throw EPERM on Windows (Desktop, OneDrive, etc.); durability still OK without it. */
function safeFsyncSync(fd) {
  try {
    fs.fsyncSync(fd);
  } catch (e) {
    const c = e && e.code;
    if (c === "EPERM" || c === "EINVAL" || c === "ENOTSUP") return;
    throw e;
  }
}

/**
 * Atomic write: write to temp file, fsync, rename. Must be called inside withLock.
 */
function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.${base}.tmp.${Date.now()}`);
  const fd = fs.openSync(tmpPath, "w");
  try {
    fs.writeFileSync(fd, content, "utf8");
    safeFsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
}

/**
 * Recover corrupted file: rename to .corrupt.<ts>, write default, append experience.
 * Caller must hold lock. appendExperienceRaw is the internal append (lock already held).
 */
function recoverCorrupt(absolutePath, defaultContent, appendExperienceRaw) {
  const ts = Date.now();
  const corruptPath = `${absolutePath}.corrupt.${ts}`;
  fs.renameSync(absolutePath, corruptPath);
  const dir = path.dirname(absolutePath);
  const base = path.basename(absolutePath);
  const tmpPath = path.join(dir, `.${base}.tmp.${ts}`);
  fs.writeFileSync(tmpPath, defaultContent, "utf8");
  const fd = fs.openSync(tmpPath, "r");
  safeFsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tmpPath, absolutePath);
  if (typeof appendExperienceRaw === "function") {
    appendExperienceRaw(`recovered corrupted identity file ${base}`);
  }
}

/**
 * Append a line to experiences.log. Rotation if > 5 MB. No-op if identity dir missing or lock busy.
 */
function appendExperience(line) {
  if (!identityDirExists()) return;
  const result = withLock(() => {
    appendExperienceRaw(line);
  });
  return result;
}

/**
 * Internal append (assumes lock held). Handles rotation then appends.
 */
function appendExperienceRaw(line) {
  const root = getRoot();
  const expPath = experiencesPath();
  const rotatedPath = experiencesRotatedPath();
  let stat;
  try {
    stat = fs.statSync(expPath);
  } catch (e) {
    if (e.code === "ENOENT") {
      const content = (line.endsWith("\n") ? line : line + "\n");
      fs.writeFileSync(expPath, content, "utf8");
      const fd = fs.openSync(expPath, "r");
      safeFsyncSync(fd);
      fs.closeSync(fd);
      return;
    }
    throw e;
  }
  if (stat.size > EXPERIENCES_MAX_BYTES) {
    if (fs.existsSync(rotatedPath)) fs.unlinkSync(rotatedPath);
    fs.renameSync(expPath, rotatedPath);
  }
  const content = (line.endsWith("\n") ? line : line + "\n");
  fs.appendFileSync(expPath, content, "utf8");
  const fd = fs.openSync(expPath, "r");
  safeFsyncSync(fd);
  fs.closeSync(fd);
}

/**
 * Create missing identity file with default schema. Called when dir exists but file missing. Must be inside withLock.
 */
function ensureFile(filePath, defaultJson) {
  try {
    fs.accessSync(filePath);
    return;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const content = typeof defaultJson === "object" ? JSON.stringify(defaultJson, null, 2) : defaultJson;
  atomicWrite(filePath, content);
}

/**
 * Seed self.json from runtime state.json (device_id, first_boot). Call once when self.json missing and state exists.
 */
function seedSelfFromState(stateData) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    if (fs.existsSync(selfPath())) return null;
    const selfDir = path.dirname(selfPath());
    const knowledgeDir = path.join(selfDir, "knowledge");
    try {
      if (!fs.existsSync(knowledgeDir)) fs.mkdirSync(knowledgeDir, { recursive: true });
    } catch (_) {}
    const deviceId = stateData.device_id || null;
    const installedAt = stateData.first_boot || new Date().toISOString();
    const self = defaultSelf(deviceId, installedAt);
    ensureFile(selfPath(), self);
    ensureFile(metaPath(), defaultMeta());
    ensureFile(goalsPath(), defaultGoals());
    ensureFile(relationshipsPath(), defaultRelationships());
    ensureFile(preferencesPath(), defaultPreferences());
    return true;
  });
}

/**
 * Write suggestions.json (goal loop). Replace allowed. Uses lock + atomic write.
 */
function writeSuggestions(jsonArray) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    const content = JSON.stringify(jsonArray, null, 2);
    atomicWrite(suggestionsPath(), content);
    return true;
  });
}

/**
 * Write intentions.json (goal loop working intent). Expects data.active (array). Uses lock + atomic write.
 */
function writeIntentions(data) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    const active = Array.isArray(data && data.active) ? data.active : [];
    const content = JSON.stringify({ active }, null, 2);
    atomicWrite(intentionsPath(), content);
    return true;
  });
}

/**
 * Append to goal_history.log (goal loop). Uses lock. Rotates at 5 MB like experiences.
 */
function appendGoalHistory(line) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    const p = goalHistoryPath();
    const rotatedPath = goalHistoryRotatedPath();
    let stat;
    try {
      stat = fs.statSync(p);
    } catch (e) {
      if (e.code === "ENOENT") {
        const content = (line.endsWith("\n") ? line : line + "\n");
        fs.writeFileSync(p, content, "utf8");
        const fd = fs.openSync(p, "r");
        safeFsyncSync(fd);
        fs.closeSync(fd);
        return;
      }
      throw e;
    }
    if (stat.size > EXPERIENCES_MAX_BYTES) {
      if (fs.existsSync(rotatedPath)) fs.unlinkSync(rotatedPath);
      fs.renameSync(p, rotatedPath);
    }
    const content = (line.endsWith("\n") ? line : line + "\n");
    fs.appendFileSync(p, content, "utf8");
    const fd = fs.openSync(p, "r");
    safeFsyncSync(fd);
    fs.closeSync(fd);
  });
}

/**
 * Write last_review.json. Uses lock + atomic write.
 */
function writeLastReview(obj) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    atomicWrite(lastReviewPath(), JSON.stringify(obj, null, 2));
    return true;
  });
}

const knowledgeFormat = require("./knowledge_format");

/**
 * Read-modify-write knowledge file (add or update key). Persists v1 `{ version, entries }` on disk.
 * @param {string} topic
 * @param {string} key
 * @param {string} value
 * @param {{ category?: string | null, tags?: string[] }} [meta]
 */
function updateKnowledge(topic, key, value, meta) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    const p = knowledgePath(topic);
    const dir = path.dirname(p);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
    let data = {};
    try {
      const raw = fs.readFileSync(p, "utf8");
      data = JSON.parse(raw);
    } catch (_) {}
    const next = knowledgeFormat.upsertKey(data, key, value, meta || {});
    atomicWrite(p, JSON.stringify(next, null, 2));
    try {
      const idx = require("../memory/knowledge_index");
      if (idx && typeof idx.rebuildTopicIndex === "function") {
        idx.rebuildTopicIndex(topic);
      }
    } catch (_) {}
    try {
      const vs = require("../memory/vector_store");
      if (vs && typeof vs.onKnowledgeUpsert === "function") {
        Promise.resolve(vs.onKnowledgeUpsert(topic, key, String(value))).catch(() => {});
      }
    } catch (_) {}
    return true;
  });
}

/**
 * Write .last_review_hash (for change-detection). Uses lock.
 */
function writeLastReviewHash(hashStr) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    atomicWrite(lastReviewHashPath(), hashStr);
    return true;
  });
}

/**
 * Read current last review hash (for change-detection).
 */
function readLastReviewHash() {
  try {
    return fs.readFileSync(lastReviewHashPath(), "utf8").trim();
  } catch (_) {
    return null;
  }
}

/**
 * Write uart_registry.json (full replace). Uses lock + atomic write.
 */
function writeUartRegistry(data) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    const content = JSON.stringify(
      { devices: Array.isArray(data.devices) ? data.devices : [] },
      null,
      2
    );
    atomicWrite(uartRegistryPath(), content);
    return true;
  });
}

/**
 * Write .last_uart_decay timestamp (ISO string). Uses lock + atomic write.
 */
function writeLastUartDecay(isoString) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    atomicWrite(lastUartDecayPath(), (isoString || new Date().toISOString()) + "\n");
    return true;
  });
}

/**
 * Update meta.json self_summary (one-line persistent summary for prompt). Max 500 chars.
 */
function writeSelfSummary(text) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    const readers = require("./readers");
    const meta = readers.loadMeta();
    const next = String(text != null ? text : "").trim().slice(0, 500);
    meta.self_summary = next;
    atomicWrite(metaPath(), JSON.stringify(meta, null, 2));
    return true;
  });
}

/**
 * Update meta.json writing_style (how to write replies: tone, formality, length). Max 500 chars. Used in system prompt.
 */
function writeWritingStyle(text) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    const readers = require("./readers");
    const meta = readers.loadMeta();
    const next = String(text != null ? text : "").trim().slice(0, 500);
    meta.writing_style = next;
    atomicWrite(metaPath(), JSON.stringify(meta, null, 2));
    return true;
  });
}

/**
 * Write identity_state.json (builder-researcher mutable state). Uses lock + atomic write.
 */
function writeIdentityState(data) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    const state = data && typeof data === "object" ? data : defaultIdentityState();
    atomicWrite(identityStatePath(), JSON.stringify(state, null, 2));
    return true;
  });
}

/**
 * Write experiments.json (queue of moves). Uses lock + atomic write.
 */
function writeExperiments(data) {
  if (!identityDirExists()) return null;
  return withLock(() => {
    const payload = data && typeof data === "object" && Array.isArray(data.active) ? { active: data.active } : defaultExperiments();
    atomicWrite(experimentsPath(), JSON.stringify(payload, null, 2));
    return true;
  });
}

/**
 * Append one JSON line to ledger.jsonl (append-only). Uses lock. Line must be a JSON-serializable object.
 */
function appendLedgerLine(entry) {
  if (!identityDirExists()) return null;
  const line = typeof entry === "object" ? JSON.stringify(entry) : String(entry);
  const content = (line.endsWith("\n") ? line : line + "\n");
  return withLock(() => {
    fs.appendFileSync(ledgerPath(), content, "utf8");
    const fd = fs.openSync(ledgerPath(), "r");
    safeFsyncSync(fd);
    fs.closeSync(fd);
    return true;
  });
}

/**
 * If last_reset_day is not today, reset api_budget_spent_today to 0 and set last_reset_day to today; write back.
 * Call before any budget check. Uses lock + atomic write.
 */
function ensureDailyBudgetReset() {
  if (!identityDirExists()) return null;
  return withLock(() => {
    const readers = require("./readers");
    const state = readers.loadIdentityState();
    const today = new Date().toISOString().slice(0, 10);
    if (state.last_reset_day === today) return true;
    state.resources = state.resources || {};
    state.resources.api_budget_spent_today = 0;
    state.last_reset_day = today;
    atomicWrite(identityStatePath(), JSON.stringify(state, null, 2));
    return true;
  });
}

/**
 * Write codex_credentials.json (OAuth tokens for OpenAI Codex). Uses lock + atomic write. Do not log content.
 */
function writeCodexCredentials(data) {
  if (!identityDirExists()) return null;
  if (!data || typeof data !== "object") return null;
  return withLock(() => {
    const payload = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      account_id: data.account_id,
    };
    atomicWrite(codexCredentialsPath(), JSON.stringify(payload, null, 2));
    return true;
  });
}

module.exports = {
  atomicWrite,
  recoverCorrupt,
  appendExperience,
  appendExperienceRaw,
  ensureFile,
  seedSelfFromState,
  writeSuggestions,
  writeIntentions,
  appendGoalHistory,
  writeLastReview,
  updateKnowledge,
  writeLastReviewHash,
  readLastReviewHash,
  writeUartRegistry,
  writeLastUartDecay,
  writeSelfSummary,
  writeWritingStyle,
  writeIdentityState,
  writeExperiments,
  appendLedgerLine,
  ensureDailyBudgetReset,
  writeCodexCredentials,
};
