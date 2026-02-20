"use strict";

const crypto = require("crypto");
const identityBridge = require("../identity_bridge");
const perception = require("../perception/perceive");
const healthGate = require("./health_gate");
const evaluator = require("./evaluator");
const suggestionsModule = require("./suggestions");
const uartDecay = require("../uart_identity/decay");

const EXPERIENCES_TAIL = 200;

/**
 * Hash must depend only on evaluated goal states, experience tail content, and knowledge snapshot—
 * not on wall-clock time—so NTP or clock changes do not cause false "state changed".
 */
function hashState(experienceLines, evaluatedGoals) {
  const str = JSON.stringify({ exp: experienceLines, goals: evaluatedGoals });
  return crypto.createHash("sha256").update(str).digest("hex");
}

function getSystemState() {
  let update_available = false;
  let missing_integrations = [];
  try {
    const updateState = require("../update_probe/state");
    const probe = updateState.loadProbeState();
    const versionState = require("../introspection/version_state");
    const ver = versionState.getVersionState();
    const current = (ver && ver.version) || "";
    if (probe.last_notified_version && probe.last_notified_version !== current) {
      update_available = true;
    }
  } catch (_) {}
  try {
    const integrations = require("../integrations/registry");
    missing_integrations = integrations.checkIntegrations().missing || [];
  } catch (_) {}
  return { update_available, missing_integrations };
}

const MAX_ACTIVE_INTENTIONS = 7;

/**
 * Compute current intentions from evaluated goals and system state. Only review loop writes these.
 * Returns { active: [{ id, since, reason, mode }] }. Used for suggestion weighting and prompt.
 */
function computeIntentions(evaluated, systemState) {
  const now = new Date().toISOString();
  const active = [];

  const hasStalledUartOrLearn = evaluated.some(
    (r) => r.status === "stalled" && (r.goal.toLowerCase().includes("uart") || r.goal.toLowerCase().includes("learn"))
  );
  if (hasStalledUartOrLearn) {
    const reason = evaluated.find(
      (r) => r.status === "stalled" && (r.goal.toLowerCase().includes("uart") || r.goal.toLowerCase().includes("learn"))
    );
    active.push({
      id: "maintain_uart_visibility",
      since: now,
      reason: reason ? `goal "${reason.goal}" stalled (no recent activity)` : "UART traffic previously stalled",
      mode: "observe",
    });
  }

  const missing = systemState && Array.isArray(systemState.missing_integrations) ? systemState.missing_integrations : [];
  if (missing.length > 0) {
    active.push({
      id: "prepare_integration_setup",
      since: now,
      reason: "Integrations missing: " + missing.join(", "),
      mode: "awaiting_input",
    });
  }

  return { active: active.slice(0, MAX_ACTIVE_INTENTIONS) };
}

function runReview() {
  const startMs = Date.now();
  if (!identityBridge.isAvailable()) return;

  const health = healthGate.runHealthGate();
  if (!health.ok) {
    identityBridge.appendExperience(`skipped review (system not stable): ${health.reason || "unknown"}`);
    identityBridge.writeLastReview({
      at: new Date().toISOString(),
      result: "skipped",
      reason: health.reason,
      duration_ms: Date.now() - startMs,
    });
    perception.emit("goal_review_done", {
      result: "skipped",
      duration_ms: Date.now() - startMs,
      reason: health.reason,
    });
    return;
  }

  try {
    uartDecay.runIfDue();
  } catch (_) {}

  const goals = identityBridge.loadGoals();
  const experienceLines = identityBridge.loadExperiencesTail(EXPERIENCES_TAIL);
  const knowledge = {};
  try {
    knowledge.learned_tools = identityBridge.loadKnowledge("learned_tools");
  } catch (_) {}

  const evaluated = evaluator.evaluateGoals(goals, experienceLines, knowledge);
  const uptimeSec = Math.floor(process.uptime());
  const goalHistoryLine = `${new Date().toISOString()} uptime=${uptimeSec} review: ${evaluated.map((e) => `${e.goal} → ${e.status}`).join("; ")}`;
  identityBridge.appendGoalHistory(goalHistoryLine);

  const newHash = hashState(experienceLines, evaluated);
  const lastHash = identityBridge.readLastReviewHash();
  const stateChanged = lastHash !== newHash;
  identityBridge.writeLastReviewHash(newHash);

  let suggestionCount = 0;
  let suggestionList = [];
  if (stateChanged) {
    const systemState = getSystemState();
    const computedIntentions = computeIntentions(evaluated, systemState);
    suggestionList = suggestionsModule.generateSuggestions(
      evaluated,
      experienceLines,
      knowledge,
      systemState,
      computedIntentions
    );
    suggestionCount = suggestionList.length;
    identityBridge.writeSuggestions(suggestionList);
    identityBridge.writeIntentions(computedIntentions);
    if (suggestionCount > 0) {
      try {
        const notifier = require("../events/notifier");
        const msg = "Thoughts: " + suggestionList.map((s) => s.suggest).join(". ");
        notifier.notify(msg);
      } catch (_) {}
    }
  }

  identityBridge.appendExperience(`review ok (goals=${evaluated.length} changed=${stateChanged ? 1 : 0} suggestions=${suggestionCount})`);
  identityBridge.writeLastReview({
    at: new Date().toISOString(),
    result: "ok",
    duration_ms: Date.now() - startMs,
  });
  perception.emit("goal_review_done", {
    result: "ok",
    duration_ms: Date.now() - startMs,
  });
}

module.exports = { runReview };
