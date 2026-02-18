"use strict";

const fs = require("fs");
const path = require("path");
const {
  selfPath,
  relationshipsPath,
  goalsPath,
  experiencesPath,
  preferencesPath,
  metaPath,
  knowledgePath,
  lastReviewPath,
  uartRegistryPath,
  lastUartDecayPath,
  getRoot,
} = require("./paths");
const { identityDirExists } = require("./lock");
const {
  defaultSelf,
  defaultGoals,
  defaultRelationships,
  defaultPreferences,
  defaultMeta,
} = require("./defaults");
const writers = require("./writers");

function readJsonSafe(filePath, defaultObj, onCorrupt) {
  if (!identityDirExists()) return defaultObj;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return defaultObj;
    if (e instanceof SyntaxError && onCorrupt) {
      const defaultContent = JSON.stringify(defaultObj, null, 2);
      onCorrupt(filePath, defaultContent);
      return defaultObj;
    }
    throw e;
  }
}

function recoverAndReturnDefault(absolutePath, defaultContent) {
  writers.recoverCorrupt(absolutePath, defaultContent, (msg) => {
    writers.appendExperienceRaw(msg);
  });
}

function loadSelf() {
  const def = defaultSelf();
  const data = readJsonSafe(selfPath(), def, (p, content) => {
    const lock = require("./lock").withLock;
    lock(() => {
      recoverAndReturnDefault(p, content);
    });
  });
  return {
    device_id: data.device_id ?? def.device_id,
    name: data.name ?? def.name,
    installed_at: data.installed_at ?? def.installed_at,
    owner: data.owner ?? def.owner,
    mission: data.mission ?? def.mission,
    values: Array.isArray(data.values) ? data.values : def.values,
  };
}

function loadGoals() {
  const def = defaultGoals();
  const data = readJsonSafe(goalsPath(), def, (p, content) => {
    const lock = require("./lock").withLock;
    lock(() => {
      recoverAndReturnDefault(p, content);
    });
  });
  return {
    long_term: Array.isArray(data.long_term) ? data.long_term : def.long_term,
    mid_term: Array.isArray(data.mid_term) ? data.mid_term : def.mid_term,
    short_term: Array.isArray(data.short_term) ? data.short_term : def.short_term,
  };
}

function loadRelationships() {
  const def = defaultRelationships();
  const data = readJsonSafe(relationshipsPath(), def, (p, content) => {
    const lock = require("./lock").withLock;
    lock(() => {
      recoverAndReturnDefault(p, content);
    });
  });
  return {
    humans: data.humans && typeof data.humans === "object" ? data.humans : def.humans,
    agents: data.agents && typeof data.agents === "object" ? data.agents : def.agents,
  };
}

function loadPreferences() {
  const def = defaultPreferences();
  const data = readJsonSafe(preferencesPath(), def, (p, content) => {
    const lock = require("./lock").withLock;
    lock(() => {
      recoverAndReturnDefault(p, content);
    });
  });
  return {
    check_updates_hours: data.check_updates_hours ?? def.check_updates_hours,
    verbosity: data.verbosity ?? def.verbosity,
    exploration_allowed: data.exploration_allowed ?? def.exploration_allowed,
    self_modify: data.self_modify ?? def.self_modify,
  };
}

function loadMeta() {
  const def = defaultMeta();
  const data = readJsonSafe(metaPath(), def, (p, content) => {
    const lock = require("./lock").withLock;
    lock(() => {
      recoverAndReturnDefault(p, content);
    });
  });
  return data;
}

/**
 * Last N lines of experiences.log (newest at end). Returns [] if missing or unreadable.
 */
function loadExperiencesTail(n) {
  if (!identityDirExists()) return [];
  const p = experiencesPath();
  try {
    const raw = fs.readFileSync(p, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    return lines.slice(-n);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    return [];
  }
}

function loadKnowledge(topic) {
  if (!identityDirExists()) return {};
  const p = knowledgePath(topic);
  try {
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw);
    return typeof data === "object" && data !== null ? data : {};
  } catch (e) {
    if (e.code === "ENOENT") return {};
    if (e instanceof SyntaxError) {
      const lock = require("./lock").withLock;
      lock(() => {
        writers.recoverCorrupt(p, "{}", (msg) => writers.appendExperienceRaw(msg));
      });
      return {};
    }
    return {};
  }
}

/**
 * Whether the identity directory exists (identity layer configured).
 */
function isAvailable() {
  return identityDirExists();
}

/**
 * Read last_review.json (read-only; no lock). Returns parsed object or null.
 */
function getLastReview() {
  if (!identityDirExists()) return null;
  try {
    const raw = fs.readFileSync(lastReviewPath(), "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    return null;
  }
}

/**
 * Load uart_registry.json. Returns { devices: [] } when missing or unreadable.
 */
function loadUartRegistry() {
  if (!identityDirExists()) return { devices: [] };
  try {
    const raw = fs.readFileSync(uartRegistryPath(), "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data.devices) ? data : { devices: [] };
  } catch (e) {
    if (e.code === "ENOENT") return { devices: [] };
    return { devices: [] };
  }
}

/**
 * Read .last_uart_decay timestamp. Returns ISO string or null.
 */
function readLastUartDecay() {
  if (!identityDirExists()) return null;
  try {
    return fs.readFileSync(lastUartDecayPath(), "utf8").trim();
  } catch (e) {
    if (e.code === "ENOENT") return null;
    return null;
  }
}

module.exports = {
  loadSelf,
  loadGoals,
  loadRelationships,
  loadPreferences,
  loadMeta,
  loadExperiencesTail,
  loadKnowledge,
  isAvailable,
  getLastReview,
  loadUartRegistry,
  readLastUartDecay,
};
