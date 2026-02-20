"use strict";

/**
 * API credit / billing awareness. No API calls — presence check only.
 */
function getBillingStatus() {
  const hasKey = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
  const hasBudget = !!(process.env.PICLAW_MONTHLY_BUDGET && process.env.PICLAW_MONTHLY_BUDGET.trim());
  return {
    budget_configured: hasBudget,
    key_configured: hasKey,
    spend_tracking: "passive",
    mode: hasKey && hasBudget ? "guarded" : hasKey ? "unbounded" : "missing",
  };
}

module.exports = { getBillingStatus };
