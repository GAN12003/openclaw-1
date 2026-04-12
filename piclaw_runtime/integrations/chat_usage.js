"use strict";

/**
 * Log OpenAI-compatible chat completion usage to identity ledger (JSON lines).
 * Optionally charges abstract budget units via PICLAW_OPENAI_BUDGET_UNITS_PER_1K_TOTAL.
 *
 * @param {object} usage - Provider usage object (prompt_tokens, etc.).
 * @param {{ duration_ms?: number, rss_mb?: number }} [meta] - Request wall time and process RSS after completion.
 */

function logChatCompletionUsage(usage, meta) {
  if (!usage || typeof usage !== "object") return;
  const m = meta && typeof meta === "object" ? meta : {};
  const pt = usage.prompt_tokens;
  const ct = usage.completion_tokens;
  const tt = usage.total_tokens;
  if (pt == null && ct == null && tt == null) return;
  const duration_ms =
    typeof m.duration_ms === "number" && Number.isFinite(m.duration_ms) ? Math.round(m.duration_ms) : null;
  const rss_mb =
    typeof m.rss_mb === "number" && Number.isFinite(m.rss_mb) ? Math.round(m.rss_mb * 10) / 10 : null;
  try {
    const identityBridge = require("../identity_bridge");
    if (!identityBridge.isAvailable()) return;
    identityBridge.appendLedgerLine({
      type: "openai_chat",
      ts: new Date().toISOString(),
      prompt_tokens: typeof pt === "number" ? pt : null,
      completion_tokens: typeof ct === "number" ? ct : null,
      total_tokens: typeof tt === "number" ? tt : null,
      duration_ms,
      rss_mb,
    });
  } catch (_) {}

  const rate = Number(process.env.PICLAW_OPENAI_BUDGET_UNITS_PER_1K_TOTAL);
  if (typeof tt === "number" && tt > 0 && Number.isFinite(rate) && rate > 0) {
    try {
      const budgetGuard = require("../economy/budget_guard");
      budgetGuard.recordSpend((tt / 1000) * rate);
    } catch (_) {}
  }
}

/**
 * Approximate context size per user turn (agent loop may add more tokens).
 * @param {{ system_prompt_chars?: number, history_chars?: number, history_messages?: number }} stats
 */
function logContextStats(stats) {
  if (!stats || typeof stats !== "object") return;
  try {
    const identityBridge = require("../identity_bridge");
    if (!identityBridge.isAvailable()) return;
    identityBridge.appendLedgerLine({
      type: "context_stats",
      ts: new Date().toISOString(),
      system_prompt_chars:
        typeof stats.system_prompt_chars === "number" ? stats.system_prompt_chars : null,
      history_chars: typeof stats.history_chars === "number" ? stats.history_chars : null,
      history_messages: typeof stats.history_messages === "number" ? stats.history_messages : null,
    });
  } catch (_) {}
}

module.exports = { logChatCompletionUsage, logContextStats };
