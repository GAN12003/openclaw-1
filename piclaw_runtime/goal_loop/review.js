"use strict";

const crypto = require("crypto");
const identityBridge = require("../identity_bridge");
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
  return { update_available };
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
  if (stateChanged) {
    const systemState = getSystemState();
    const suggestionList = suggestionsModule.generateSuggestions(evaluated, experienceLines, knowledge, systemState);
    suggestionCount = suggestionList.length;
    identityBridge.writeSuggestions(suggestionList);
  }

  identityBridge.appendExperience(`review ok (goals=${evaluated.length} changed=${stateChanged ? 1 : 0} suggestions=${suggestionCount})`);
  identityBridge.writeLastReview({
    at: new Date().toISOString(),
    result: "ok",
    duration_ms: Date.now() - startMs,
  });
}

module.exports = { runReview };
