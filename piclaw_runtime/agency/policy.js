"use strict";

/**
 * Agency policy — the leash. Decides what Piclaw is allowed to self-initiate.
 * NOT AI: bounded decision executor only. No install, no code change, no GPIO without explicit rule.
 */

/** Action types the agency may perform when policy allows. */
const ALLOWED_ACTIONS = new Set([
  "probe_uart",      // Passive UART probe (rate-limited)
  "notify_owner",    // Send Telegram message to owner
  "refresh_status",   // Record status snapshot to experience
  "check_updates",   // Run update check (read-only), record result
  "housekeeping",    // Rotate logs / internal housekeeping
  "display_lcd",     // Display info on LCD (no-op until LCD driver exists)
]);

/** Actions never allowed: install software, change code, drive GPIO, arbitrary internet. */
const FORBIDDEN_ACTIONS = new Set([
  "install",
  "code_change",
  "gpio_output",
  "internet_arbitrary",
]);

/**
 * Whether the agency is allowed to perform this action type.
 * @param {string} actionType - One of ALLOWED_ACTIONS or FORBIDDEN_ACTIONS.
 * @returns {boolean}
 */
function isAllowed(actionType) {
  if (!actionType || typeof actionType !== "string") return false;
  const key = actionType.trim().toLowerCase();
  if (FORBIDDEN_ACTIONS.has(key)) return false;
  return ALLOWED_ACTIONS.has(key);
}

/**
 * Get the set of allowed action types (read-only).
 * @returns {Set<string>}
 */
function getAllowedActions() {
  return new Set(ALLOWED_ACTIONS);
}

module.exports = {
  isAllowed,
  getAllowedActions,
};
