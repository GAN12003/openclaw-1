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
} = require("./defaults");

const EXPERIENCES_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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
    fs.fsyncSync(fd);
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
  fs.fsyncSync(fd);
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
      fs.fsyncSync(fd);
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
  fs.fsyncSync(fd);
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
        fs.fsyncSync(fd);
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
    fs.fsyncSync(fd);
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

/**
 * Read-modify-write knowledge file (add or update key). Uses lock + atomic write.
 */
function updateKnowledge(topic, key, value) {
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
    data[key] = value;
    atomicWrite(p, JSON.stringify(data, null, 2));
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

module.exports = {
  atomicWrite,
  recoverCorrupt,
  appendExperience,
  appendExperienceRaw,
  ensureFile,
  seedSelfFromState,
  writeSuggestions,
  appendGoalHistory,
  writeLastReview,
  updateKnowledge,
  writeLastReviewHash,
  readLastReviewHash,
  writeUartRegistry,
  writeLastUartDecay,
};
