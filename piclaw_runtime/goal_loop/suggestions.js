"use strict";

/**
 * Generate suggestions from evaluated goals, experiences, and system state.
 * Rule-based only. Returns array of { type, reason, suggest }.
 */

function generateSuggestions(evaluatedGoals, experienceLines, knowledge, systemState) {
  const suggestions = [];
  const hasUpdate = systemState && systemState.update_available === true;
  if (hasUpdate) {
    suggestions.push({ type: "update", reason: "update available", suggest: "run /update" });
  }

  for (const r of evaluatedGoals) {
    if (r.status === "stalled" && (r.goal.toLowerCase().includes("uart") || r.goal.toLowerCase().includes("learn"))) {
      suggestions.push({
        type: "diagnostic",
        reason: `goal "${r.goal}" stalled (no recent activity)`,
        suggest: "run /probe_uart",
      });
    }
  }

  return suggestions;
}

module.exports = { generateSuggestions };
