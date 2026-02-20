"use strict";

/**
 * Daily API budget guard. Ensures last_reset_day is today before checks; denies if spend would exceed daily cap.
 */

const identityBridge = require("../identity_bridge");

function ensureDailyReset() {
  try {
    identityBridge.ensureDailyBudgetReset();
  } catch (_) {}
}

function getBudgetState() {
  try {
    ensureDailyReset();
    const state = identityBridge.loadIdentityState();
    const resources = state.resources || {};
    const daily = typeof resources.api_budget_daily === "number" ? resources.api_budget_daily : 2.0;
    const spent = typeof resources.api_budget_spent_today === "number" ? resources.api_budget_spent_today : 0;
    return { daily, spent, remaining: Math.max(0, daily - spent) };
  } catch (_) {
    return { daily: 2.0, spent: 0, remaining: 2.0 };
  }
}

function canSpend(amount) {
  const state = getBudgetState();
  const cost = typeof amount === "number" ? amount : 0;
  return cost >= 0 && state.remaining >= cost;
}

function recordSpend(amount) {
  if (typeof amount !== "number" || amount <= 0) return;
  try {
    ensureDailyReset();
    const state = identityBridge.loadIdentityState();
    state.resources = state.resources || {};
    const spent = state.resources.api_budget_spent_today || 0;
    state.resources.api_budget_spent_today = spent + amount;
    identityBridge.writeIdentityState(state);
  } catch (_) {}
}

module.exports = { ensureDailyReset, getBudgetState, canSpend, recordSpend };
