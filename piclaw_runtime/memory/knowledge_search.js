"use strict";

const knowledgeIndex = require("./knowledge_index");

const DEFAULT_TOPICS = ["memory", "learned_tools"];

/**
 * @param {{ query: string, topics?: string[], category?: string, tag?: string, maxResults?: number, maxChars?: number }} opts
 * @returns {string}
 */
function searchKnowledge(opts) {
  const readers = require("../identity_bridge/readers");
  const q = (opts && opts.query ? String(opts.query) : "").trim();
  const topics = Array.isArray(opts.topics) && opts.topics.length ? opts.topics : DEFAULT_TOPICS;
  const category = opts.category ? String(opts.category).trim().toLowerCase() : "";
  const tag = opts.tag ? String(opts.tag).trim().toLowerCase() : "";
  const maxResults = Math.min(50, Math.max(1, Number(opts.maxResults) || 12));
  const maxChars = Math.min(12000, Math.max(400, Number(opts.maxChars) || 6000));

  if (!readers.isAvailable()) return "memory_search: identity not configured.";
  if (!q) return "memory_search: query is required.";

  const lines = [];
  let charBudget = 0;

  for (const topic of topics) {
    const safeTopic = String(topic).replace(/[^a-z0-9_]/gi, "") || "memory";
    const keysFromIndex = knowledgeIndex.lookupKeys(safeTopic, q);
    const entries = readers.loadKnowledgeEntries(safeTopic);
    const keySet = new Set(keysFromIndex);
    /** @type {typeof entries} */
    let candidates = entries.filter((e) => {
      const blob = `${e.key} ${e.value} ${(e.category || "")} ${(e.tags || []).join(" ")}`.toLowerCase();
      const matchQ = blob.includes(q.toLowerCase());
      const matchKey = keySet.has(e.key);
      if (!matchQ && !matchKey) return false;
      if (category && (!e.category || e.category.toLowerCase() !== category)) return false;
      if (tag && !(e.tags || []).map((t) => t.toLowerCase()).includes(tag)) return false;
      return true;
    });
    if (candidates.length === 0) {
      candidates = entries.filter((e) => {
        const blob = `${e.key} ${e.value}`.toLowerCase();
        return blob.includes(q.toLowerCase());
      });
    }
    candidates = candidates.slice(0, maxResults);
    for (const e of candidates) {
      const block = [
        `[topic=${safeTopic} key=${e.key} source=knowledge/${safeTopic}.json]`,
        e.category ? `category: ${e.category}` : null,
        (e.tags || []).length ? `tags: ${(e.tags || []).join(", ")}` : null,
        `value: ${e.value}`,
        "---",
      ]
        .filter(Boolean)
        .join("\n");
      if (charBudget + block.length + 1 > maxChars) break;
      lines.push(block);
      charBudget += block.length + 1;
    }
  }

  if (lines.length === 0) return `memory_search: no matches for ${JSON.stringify(q)} (topics: ${topics.join(", ")}).`;
  return lines.join("\n");
}

module.exports = { searchKnowledge, DEFAULT_TOPICS };
