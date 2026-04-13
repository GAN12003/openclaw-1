"use strict";

const crypto = require("crypto");
const snippets = require("./telegram_snippets");

const FEEDBACK_GOOD_TOPIC = "feedback_good";
const FEEDBACK_BAD_TOPIC = "feedback_bad";

/** Built-in emoji (normalized) → preset id. Override/extend via PICLAW_TELEGRAM_REACTION_MAP JSON. */
const DEFAULT_EMOJI_TO_PRESET = {
  "❤": "heart",
  "❤️": "heart",
  "🔥": "fire",
  "👍": "thumbs_up",
  "👍🏻": "thumbs_up",
  "👍🏼": "thumbs_up",
  "👍🏽": "thumbs_up",
  "👍🏾": "thumbs_up",
  "👍🏿": "thumbs_up",
  "👎": "thumbs_down",
  "👏": "applause",
};

function isReactionsEnabled() {
  const v = String(process.env.PICLAW_TELEGRAM_REACTIONS_ENABLED || "1")
    .trim()
    .toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

function reactionsOwnerOnly() {
  const v = String(process.env.PICLAW_TELEGRAM_REACTIONS_OWNER_ONLY || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Merge DEFAULT_EMOJI_TO_PRESET with PICLAW_TELEGRAM_REACTION_MAP (JSON object emoji string → preset id).
 * @returns {Record<string, string>}
 */
function loadEmojiToPreset() {
  const out = { ...DEFAULT_EMOJI_TO_PRESET };
  const raw = (process.env.PICLAW_TELEGRAM_REACTION_MAP || "").trim();
  if (!raw) return out;
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object") {
      for (const [em, preset] of Object.entries(j)) {
        if (typeof em === "string" && typeof preset === "string" && preset.trim()) {
          out[normalizeEmojiKey(em)] = preset.trim().toLowerCase();
        }
      }
    }
  } catch (e) {
    console.warn("[piclaw] PICLAW_TELEGRAM_REACTION_MAP invalid JSON:", (e && e.message) || e);
  }
  return out;
}

/** Strip variation selectors for lookup; keep base grapheme where possible. */
function normalizeEmojiKey(s) {
  return String(s || "").trim();
}

/**
 * @param {unknown} r - ReactionType from Bot API
 * @returns {string | null} emoji or custom id
 */
function reactionKey(r) {
  if (!r || typeof r !== "object") return null;
  if (r.type === "emoji" && r.emoji) return normalizeEmojiKey(r.emoji);
  if (r.type === "custom_emoji" && r.custom_emoji_id) return `custom:${r.custom_emoji_id}`;
  return null;
}

/**
 * @param {unknown[]} arr
 * @returns {string[]}
 */
function reactionKeys(arr) {
  if (!Array.isArray(arr)) return [];
  const keys = [];
  for (const r of arr) {
    const k = reactionKey(r);
    if (k) keys.push(k);
  }
  return keys;
}

/**
 * Keys present in newArr but not in oldArr (order preserved from newArr).
 * @param {unknown[]} oldArr
 * @param {unknown[]} newArr
 */
function addedReactionKeys(oldArr, newArr) {
  const oldSet = new Set(reactionKeys(oldArr));
  const added = [];
  for (const r of newArr || []) {
    const k = reactionKey(r);
    if (k && !oldSet.has(k)) added.push(k);
  }
  return added;
}

function randomKeySuffix() {
  return crypto.randomBytes(4).toString("hex");
}

/**
 * @param {string} preset
 * @param {{ chatId: number|string, messageId: number, reactorUserId: number | null, snippet: string | null, emojiKey: string }} ctx
 * @param {{ identityBridge: object, appendExperience?: (s: string) => void }} deps
 */
function applyPreset(preset, ctx, deps) {
  const ib = deps.identityBridge;
  if (!ib || typeof ib.isAvailable !== "function" || !ib.isAvailable()) {
    console.log("[piclaw] reaction: identity not available, skip preset=" + preset);
    return;
  }
  const { chatId, messageId, reactorUserId, snippet, emojiKey } = ctx;
  const who = reactorUserId != null ? `user_id=${reactorUserId}` : "unknown_user";
  const ctxLine = `chat=${chatId} msg=${messageId} ${who} emoji=${emojiKey}`;
  const contextBlock = snippet ? ` Message context: "${snippet.slice(0, 400).replace(/"/g, "'")}".` : " Message text was not cached for this id.";

  switch (preset) {
    case "heart": {
      const k = `telegram_reaction_heart_${Date.now()}_${randomKeySuffix()}`;
      const value = `Good idea — worth keeping.${contextBlock}`;
      ib.updateKnowledge("memory", k, value, {
        category: "telegram_reaction",
        tags: ["reaction", "heart", "good_idea", "memorize"],
      });
      if (deps.appendExperience) deps.appendExperience(`Telegram ❤ reaction (${ctxLine}) stored as memory key ${k}.`);
      break;
    }
    case "fire": {
      const k = `telegram_reaction_fire_${Date.now()}_${randomKeySuffix()}`;
      const value = `Flagged for long-term follow-up / deeper tie-in.${contextBlock}`;
      ib.updateKnowledge("memory", k, value, {
        category: "telegram_reaction",
        tags: ["reaction", "fire", "long_term", "memorize"],
      });
      if (deps.appendExperience) deps.appendExperience(`Telegram 🔥 reaction (${ctxLine}) stored as long-term memory ${k}.`);
      break;
    }
    case "thumbs_up": {
      const k = `tg_good_${Date.now()}_${randomKeySuffix()}`;
      const value = `Positive feedback — prefer this style or conclusion when similar topics arise.${contextBlock}`;
      ib.updateKnowledge(FEEDBACK_GOOD_TOPIC, k, value, {
        category: "telegram_reaction",
        tags: ["reaction", "thumbs_up", "feedback_good"],
      });
      if (deps.appendExperience) deps.appendExperience(`Telegram 👍 (${ctxLine}) recorded in ${FEEDBACK_GOOD_TOPIC}.`);
      break;
    }
    case "thumbs_down": {
      const k = `tg_bad_${Date.now()}_${randomKeySuffix()}`;
      const value = `Negative feedback — avoid repeating this phrasing or stance; treat as dispreferred.${contextBlock}`;
      ib.updateKnowledge(FEEDBACK_BAD_TOPIC, k, value, {
        category: "telegram_reaction",
        tags: ["reaction", "thumbs_down", "feedback_bad"],
      });
      if (deps.appendExperience) deps.appendExperience(`Telegram 👎 (${ctxLine}) recorded in ${FEEDBACK_BAD_TOPIC}.`);
      break;
    }
    case "ignore":
      break;
    case "applause": {
      const k = `telegram_reaction_applause_${Date.now()}_${randomKeySuffix()}`;
      const value = `Operator approved proceeding with this idea or plan now.${contextBlock}`;
      ib.updateKnowledge("memory", k, value, {
        category: "telegram_reaction",
        tags: ["reaction", "applause", "approved_action"],
      });
      if (deps.appendExperience) {
        deps.appendExperience(`Telegram 👏 approval (${ctxLine}) — memory ${k}; treat as go-ahead when safe.`);
      }
      break;
    }
    default:
      console.log("[piclaw] reaction: unknown preset " + preset + " for emoji " + emojiKey);
  }
}

/**
 * @param {import("node-telegram-bot-api").MessageReactionUpdated | object} upd
 * @param {{ identityBridge: object, isOwnerUser?: (userId: number) => boolean, appendExperience?: (s: string) => void }} deps
 */
function handleMessageReaction(upd, deps) {
  if (!isReactionsEnabled()) return;
  const chat = upd.chat;
  const user = upd.user;
  const messageId = upd.message_id;
  const oldR = upd.old_reaction;
  const newR = upd.new_reaction;
  if (!chat || messageId == null) return;

  const reactorId = user && user.id;
  if (reactionsOwnerOnly() && typeof deps.isOwnerUser === "function" && reactorId != null && !deps.isOwnerUser(reactorId)) {
    return;
  }

  const added = addedReactionKeys(oldR, newR);
  if (added.length === 0) return;

  const map = loadEmojiToPreset();
  const sn = snippets.get(chat.id, messageId);

  for (const emojiKey of added) {
    const preset = map[emojiKey];
    if (!preset) continue;

    applyPreset(
      preset,
      {
        chatId: chat.id,
        messageId,
        reactorUserId: reactorId != null ? reactorId : null,
        snippet: sn ? sn.text : null,
        emojiKey,
      },
      deps
    );
  }
}

module.exports = {
  handleMessageReaction,
  isReactionsEnabled,
  FEEDBACK_GOOD_TOPIC,
  FEEDBACK_BAD_TOPIC,
  DEFAULT_EMOJI_TO_PRESET,
};
