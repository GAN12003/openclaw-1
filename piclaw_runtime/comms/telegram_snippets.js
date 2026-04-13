"use strict";

/** Max messages to remember for reaction ↔ text context (per process). */
const MAX_SNIPPETS = 800;

/** @type {Map<string, { text: string, fromUserId: number | null, at: string }>} */
const store = new Map();

function key(chatId, messageId) {
  return `${chatId}:${messageId}`;
}

/**
 * Remember short text for a chat message (for Telegram reaction context).
 * @param {number|string} chatId
 * @param {number} messageId
 * @param {string} text
 * @param {number | null | undefined} fromUserId
 */
function record(chatId, messageId, text, fromUserId) {
  if (messageId == null || chatId == null) return;
  const t = String(text || "").trim();
  if (!t) return;
  const k = key(chatId, messageId);
  if (store.size >= MAX_SNIPPETS && !store.has(k)) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
  store.set(k, {
    text: t.slice(0, 600),
    fromUserId: fromUserId != null ? Number(fromUserId) : null,
    at: new Date().toISOString(),
  });
}

/**
 * @param {number|string} chatId
 * @param {number} messageId
 * @returns {{ text: string, fromUserId: number | null, at: string } | null}
 */
function get(chatId, messageId) {
  return store.get(key(chatId, messageId)) || null;
}

module.exports = { record, get, MAX_SNIPPETS };
