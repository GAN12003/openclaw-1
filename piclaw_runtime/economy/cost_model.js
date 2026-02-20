"use strict";

/**
 * Estimate cost (in abstract budget units) per action type. Used by motivation scoring and budget_guard.
 * Phase 1: observation-style actions are cheap; API/external calls slightly higher.
 */

const DEFAULT_COSTS = {
  repo_scan: 0.02,
  update_check: 0.02,
  probe_uart: 0.01,
  notify_owner: 0.05,
};

function estimateCost(actionType) {
  if (typeof actionType !== "string") return 0.1;
  const t = actionType.toLowerCase();
  return typeof DEFAULT_COSTS[t] === "number" ? DEFAULT_COSTS[t] : 0.05;
}

module.exports = { estimateCost, DEFAULT_COSTS };
