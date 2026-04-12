"use strict";

const VERSION = 1;

/**
 * @param {unknown} data
 * @returns {boolean}
 */
function isV1(data) {
  return Boolean(
    data &&
      typeof data === "object" &&
      data.version === VERSION &&
      Array.isArray(data.entries)
  );
}

/**
 * Flat map for legacy callers (memory recall, goal loop).
 * @param {unknown} data
 * @returns { Record<string, string> }
 */
function toFlatMap(data) {
  if (!data || typeof data !== "object") return {};
  if (isV1(data)) {
    const out = {};
    for (const e of data.entries) {
      if (e && e.key != null) {
        out[String(e.key)] = e.value != null ? String(e.value) : "";
      }
    }
    return out;
  }
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === "version" || k === "entries") continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

/**
 * @param {unknown} data
 * @returns {{ version: number, entries: Array<{ id: string, key: string, value: string, category: string | null, tags: string[], updated_at: string | null }> }}
 */
function toV1Document(data) {
  if (isV1(data)) {
    return {
      version: VERSION,
      entries: (data.entries || []).map(normalizeEntry).filter((e) => e.key),
    };
  }
  const entries = [];
  const flat = toFlatMap(data);
  for (const [k, v] of Object.entries(flat)) {
    entries.push({
      id: k,
      key: k,
      value: v,
      category: null,
      tags: [],
      updated_at: null,
    });
  }
  return { version: VERSION, entries };
}

/**
 * @param {object} e
 */
function normalizeEntry(e) {
  if (!e || typeof e !== "object") {
    return { id: "", key: "", value: "", category: null, tags: [], updated_at: null };
  }
  const key = e.key != null ? String(e.key) : "";
  const id = e.id != null ? String(e.id) : key;
  const tags = Array.isArray(e.tags) ? e.tags.map((t) => String(t)) : [];
  return {
    id,
    key,
    value: e.value != null ? String(e.value) : "",
    category: e.category != null ? String(e.category) : null,
    tags,
    updated_at: e.updated_at != null ? String(e.updated_at) : null,
  };
}

/**
 * @param {unknown} data - raw parsed JSON from disk
 * @param {string} key
 * @param {string} value
 * @param {{ category?: string | null, tags?: string[] }} [meta]
 */
function upsertKey(data, key, value, meta) {
  const doc = toV1Document(data);
  const k = String(key || "").trim();
  const v = value != null ? String(value) : "";
  if (!k) return doc;
  const now = new Date().toISOString();
  const category = meta && meta.category != null && String(meta.category).trim() ? String(meta.category).trim() : null;
  let tags = [];
  if (meta && Array.isArray(meta.tags)) {
    tags = meta.tags.map((t) => String(t).trim()).filter(Boolean);
  }
  const idx = doc.entries.findIndex((e) => e.key === k);
  if (idx >= 0) {
    const prev = doc.entries[idx];
    doc.entries[idx] = {
      ...prev,
      key: k,
      value: v,
      updated_at: now,
      category: category != null ? category : prev.category,
      tags: tags.length > 0 ? tags : prev.tags || [],
    };
  } else {
    doc.entries.push({
      id: k,
      key: k,
      value: v,
      category: category || null,
      tags,
      updated_at: now,
    });
  }
  return doc;
}

/**
 * @param {unknown} data
 * @returns {Array<{ id: string, key: string, value: string, category: string | null, tags: string[], updated_at: string | null }>}
 */
function getEntries(data) {
  return toV1Document(data).entries;
}

module.exports = {
  VERSION,
  isV1,
  toFlatMap,
  toV1Document,
  upsertKey,
  getEntries,
};
