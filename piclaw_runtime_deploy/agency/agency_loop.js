"use strict";

/**
 * Agency loop — bounded decision executor. Runs every PICLAW_AGENCY_INTERVAL_MIN.
 * Reads identity + suggestions + intentions; performs only policy-allowed actions; records to experiences.
 * Does NOT mutate identity directly (only appendExperience / existing writers).
 * Intention tick: active intentions can trigger upkeep actions (same actions as suggestions, with cooldowns)
 * so the node "stays engaged" with what it is tending between goal reviews.
 */

const identityBridge = require("../identity_bridge");
const policy = require("./policy");
const perception = require("../perception/perceive");

const DEFAULT_INTERVAL_MIN = 5;
const PROBE_UART_COOLDOWN_MS = 6 * 60 * 60 * 1000;   // 6h
const CHECK_UPDATES_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2h
const NOTIFY_OWNER_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12h for intention-driven remind

let intervalId = null;
const lastRun = { probe_uart: 0, check_updates: 0, notify_owner: 0 };

/**
 * Map suggestion (from goal loop) to an agency action type, or null if none.
 * @param {{ type: string, reason?: string, suggest?: string }} suggestion
 * @returns {string | null}
 */
function suggestionToAction(suggestion) {
  if (!suggestion || typeof suggestion !== "object") return null;
  const type = (suggestion.type || "").toLowerCase();
  const suggest = (suggestion.suggest || "").toLowerCase();
  if (type === "diagnostic" && suggest.includes("probe_uart")) return "probe_uart";
  if (type === "update") return "check_updates";
  if (type === "integration") return "notify_owner";
  return null;
}

/**
 * Intention → upkeep: which action to run when this intention is active and cooldown has passed.
 * No new action types; only existing policy-allowed actions. Intentions do not write identity.
 */
const INTENTION_UPKEEP = {
  maintain_uart_visibility: {
    actionType: "probe_uart",
    cooldownMs: PROBE_UART_COOLDOWN_MS,
    lastRunKey: "probe_uart",
  },
  prepare_integration_setup: {
    actionType: "notify_owner",
    cooldownMs: NOTIFY_OWNER_COOLDOWN_MS,
    lastRunKey: "notify_owner",
  },
};

/**
 * Run one agency cycle: load suggestions and intentions; for each, if policy allows and cooldown passed, perform and record.
 * @param {{ performAction: (actionType: string, suggestion: object) => Promise<{ ok: boolean, message?: string }> }} options
 */
async function runCycle(options) {
  const performAction = options && typeof options.performAction === "function" ? options.performAction : async () => ({ ok: false });
  if (!identityBridge.isAvailable()) return;
  const now = Date.now();

  const suggestions = identityBridge.loadSuggestions();
  if (Array.isArray(suggestions) && suggestions.length > 0) {
    for (const suggestion of suggestions) {
      const actionType = suggestionToAction(suggestion);
      if (!actionType || !policy.isAllowed(actionType)) continue;
      if (actionType === "probe_uart" && now - lastRun.probe_uart < PROBE_UART_COOLDOWN_MS) continue;
      if (actionType === "check_updates" && now - lastRun.check_updates < CHECK_UPDATES_COOLDOWN_MS) continue;
      if (actionType === "notify_owner" && now - lastRun.notify_owner < NOTIFY_OWNER_COOLDOWN_MS) continue;
      try {
        const result = await performAction(actionType, suggestion);
        if (result && result.ok) {
          if (actionType === "probe_uart") lastRun.probe_uart = now;
          if (actionType === "check_updates") lastRun.check_updates = now;
          if (actionType === "notify_owner") lastRun.notify_owner = now;
          perception.emit("agency_action", { actionType, message: result.message });
        }
      } catch (err) {
        identityBridge.appendExperience(`agency: ${actionType} failed — ${(err && err.message) || "unknown"}`);
      }
    }
  }

  const intentions = identityBridge.loadIntentions();
  if (intentions && Array.isArray(intentions.active) && intentions.active.length > 0) {
    for (const intention of intentions.active) {
      const upkeep = INTENTION_UPKEEP[intention.id];
      if (!upkeep || !policy.isAllowed(upkeep.actionType)) continue;
      const last = lastRun[upkeep.lastRunKey] || 0;
      if (now - last < upkeep.cooldownMs) continue;
      const payload = { type: "intention", intentionId: intention.id, reason: intention.reason || "" };
      try {
        const result = await performAction(upkeep.actionType, payload);
        if (result && result.ok) {
          lastRun[upkeep.lastRunKey] = now;
          perception.emit("agency_action", { actionType: upkeep.actionType, message: result.message });
        }
      } catch (err) {
        identityBridge.appendExperience(`agency: ${upkeep.actionType} (intention) failed — ${(err && err.message) || "unknown"}`);
      }
    }
  }
}

/**
 * Start the agency loop. Runs first cycle after interval, then every PICLAW_AGENCY_INTERVAL_MIN.
 * @param {{ performAction: (actionType: string, suggestion: object) => Promise<{ ok: boolean, message?: string }> }} options
 */
function startAgencyLoop(options) {
  if (intervalId) return;
  const raw = process.env.PICLAW_AGENCY_INTERVAL_MIN || String(DEFAULT_INTERVAL_MIN);
  const minutes = Math.max(1, Math.min(60, parseFloat(raw) || DEFAULT_INTERVAL_MIN));
  const intervalMs = Math.round(minutes * 60 * 1000);
  function tick() {
    runCycle(options).catch((err) => {
      console.error("[piclaw] agency cycle error:", err.message);
    });
  }
  tick();
  intervalId = setInterval(tick, intervalMs);
  console.log("[piclaw] agency loop started (interval " + minutes + " min)");
}

function stopAgencyLoop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = {
  runCycle,
  startAgencyLoop,
  stopAgencyLoop,
  suggestionToAction,
};
