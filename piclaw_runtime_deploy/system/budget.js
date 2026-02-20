"use strict";

/**
 * Mock API usage tracker for LLM credits.
 * Standalone — no OpenClaw dependency.
 */
const state = {
  usedUsd: 0,
  dailyLimitUsd: 2,
  lastReset: Date.now(),
};

const DAY_MS = 24 * 60 * 60 * 1000;

function resetIfNewDay() {
  const now = Date.now();
  if (now - state.lastReset >= DAY_MS) {
    state.usedUsd = 0;
    state.lastReset = now;
  }
}

function getBudget() {
  resetIfNewDay();
  return {
    usedUsd: state.usedUsd,
    dailyLimitUsd: state.dailyLimitUsd,
    remainingUsd: Math.max(0, state.dailyLimitUsd - state.usedUsd),
  };
}

function addUsage(usd) {
  resetIfNewDay();
  state.usedUsd = (state.usedUsd || 0) + usd;
}

module.exports = { getBudget, addUsage };
