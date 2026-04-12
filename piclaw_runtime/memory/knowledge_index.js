"use strict";

/**
 * Inverted word index for knowledge topics (identity knowledge/*.json).
 * File: identity knowledge/search_index.json → { topics: { topicName: { word: [entryKeys...] } } }
 */

const fs = require("fs");
const path = require("path");
const paths = require("../identity_bridge/paths");

function indexPath() {
  return path.join(paths.getRoot(), "knowledge", "search_index.json");
}

function tokenize(text) {
  const s = String(text || "").toLowerCase();
  const parts = s.split(/[^a-z0-9_]+/).filter((w) => w.length >= 2);
  return [...new Set(parts)];
}

/**
 * @param {string} topic
 */
function rebuildTopicIndex(topic) {
  const readers = require("../identity_bridge/readers");
  if (!readers.isAvailable()) return;
  const entries = readers.loadKnowledgeEntries(topic);
  const wordToKeys = {};
  for (const e of entries) {
    const blob = [e.key, e.value, (e.category || "").toString(), ...(e.tags || [])].join(" ");
    const words = tokenize(blob);
    const k = e.key;
    for (const w of words) {
      if (!wordToKeys[w]) wordToKeys[w] = new Set();
      wordToKeys[w].add(k);
    }
  }
  const outWords = {};
  for (const [w, set] of Object.entries(wordToKeys)) {
    outWords[w] = [...set];
  }
  let all = {};
  try {
    const p = indexPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      const j = JSON.parse(raw);
      if (j && j.topics && typeof j.topics === "object") all = { ...j.topics };
    }
  } catch (_) {}
  all[topic] = outWords;
  const dir = path.dirname(indexPath());
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
  try {
    fs.writeFileSync(indexPath(), JSON.stringify({ topics: all }, null, 2), "utf8");
  } catch (_) {}
}

/**
 * @param {string} topic
 * @param {string} query
 * @returns {string[]} candidate entry keys
 */
function lookupKeys(topic, query) {
  const words = tokenize(query);
  if (words.length === 0) return [];
  try {
    const p = indexPath();
    if (!fs.existsSync(p)) return [];
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const tw = j.topics && j.topics[topic];
    if (!tw || typeof tw !== "object") return [];
    const sets = words.map((w) => new Set(tw[w] || [])).filter((s) => s.size > 0);
    if (sets.length === 0) return [];
    let acc = new Set(sets[0]);
    for (let i = 1; i < sets.length; i++) {
      const next = new Set();
      for (const x of acc) {
        if (sets[i].has(x)) next.add(x);
      }
      acc = next;
    }
    if (acc.size === 0) {
      acc = new Set();
      for (const s of sets) for (const x of s) acc.add(x);
    }
    return [...acc];
  } catch (_) {
    return [];
  }
}

module.exports = { rebuildTopicIndex, lookupKeys, tokenize, indexPath };
