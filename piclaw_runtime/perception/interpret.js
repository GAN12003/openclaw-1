"use strict";

/**
 * Deterministic interpretation: turn sensory events into short narrative strings.
 * No AI. No async. Only meaning for what already happened.
 */

function interpret(event) {
  if (!event || typeof event.type !== "string") return null;
  const payload = event.payload || {};
  switch (event.type) {
    case "wake":
      return "I am awake on Raspberry Pi Zero.";
    case "input_detected":
      return "I feel activity on my serial interface.";
    case "touch":
      return "A signal reached GPIO " + (payload.pin != null ? payload.pin : "?");
    case "filesystem_scan":
      return formatBodyScan(payload);
    case "agency_action":
      return formatAgencyAction(payload);
    case "update_available":
      return "An update is available. I will not install it myself.";
    case "goal_review_done":
      return formatGoalReviewDone(payload);
    default:
      return null;
  }
}

function formatBodyScan(payload) {
  const id = payload.identity === true ? "accessible" : "not configured";
  const ext = typeof payload.extensions === "number" ? payload.extensions : 0;
  return "I am located at my runtime. My memory is " + id + ". " + ext + " extension(s) present.";
}

function formatAgencyAction(payload) {
  const action = payload.actionType || "action";
  const msg = payload.message || "";
  if (action === "probe_uart" && msg) return "Device recognized.";
  if (action === "notify_owner") return "I have notified my owner.";
  if (action === "check_updates") return msg ? "Update check: " + msg : "I checked for updates.";
  return msg || null;
}

function formatGoalReviewDone(payload) {
  const result = payload.result || "ok";
  if (result === "skipped") {
    const reason = payload.reason || "system not stable";
    return "Goal review skipped (" + reason + ").";
  }
  return "Goal review completed.";
}

module.exports = { interpret };
