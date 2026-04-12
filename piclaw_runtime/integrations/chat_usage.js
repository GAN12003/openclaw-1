"use strict";

/**
 * Log OpenAI-compatible chat completion usage to identity ledger (JSON lines).
 * Optionally charges abstract budget units via PICLAW_OPENAI_BUDGET_UNITS_PER_1K_TOTAL.
 */

function logChatCompletionUsage(usage) {
  if (!usage || typeof usage !== "object") return;
  const pt = usage.prompt_tokens;
  const ct = usage.completion_tokens;
  const tt = usage.total_tokens;
  if (pt == null && ct == null && tt == null) return;
  try {
    const identityBridge = require("../identity_bridge");
    if (!identityBridge.isAvailable()) return;
    identityBridge.appendLedgerLine({
      type: "openai_chat",
      ts: new Date().toISOString(),
      prompt_tokens: typeof pt === "number" ? pt : null,
      completion_tokens: typeof ct === "number" ? ct : null,
      total_tokens: typeof tt === "number" ? tt : null,
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

module.exports = { logChatCompletionUsage };
