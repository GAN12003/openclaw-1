"use strict";

/**
 * Generate suggestions from evaluated goals, experiences, and system state.
 * Rule-based only. Returns array of { type, reason, suggest }.
 * If intentions (5th arg) is provided with active entries, suggestions that match an active intention are ordered first.
 */
function generateSuggestions(evaluatedGoals, experienceLines, knowledge, systemState, intentions) {
  const suggestions = [];
  const hasUpdate = systemState && systemState.update_available === true;
  if (hasUpdate) {
    suggestions.push({ type: "update", reason: "update available", suggest: "run /update" });
  }

  const missing = systemState && Array.isArray(systemState.missing_integrations) ? systemState.missing_integrations : [];
  for (const name of missing) {
    const cmd = name === "github" ? "/github" : name === "twitter" ? "/twitter" : null;
    suggestions.push({
      type: "integration",
      reason: "embodiment incomplete",
      suggest: cmd ? `set up ${name}: use ${cmd} or /status` : `set up ${name} (see /status)`,
    });
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

  if (intentions && Array.isArray(intentions.active) && intentions.active.length > 0) {
    const intentionIds = new Set(intentions.active.map((e) => e.id));
    suggestions.sort((a, b) => {
      const scoreA = suggestionMatchesIntention(a, intentionIds);
      const scoreB = suggestionMatchesIntention(b, intentionIds);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return 0;
    });
  }

  return suggestions;
}

/**
 * Return 1 if suggestion matches an active intention (for ordering), 0 otherwise.
 */
function suggestionMatchesIntention(suggestion, intentionIds) {
  if (!suggestion || !intentionIds.size) return 0;
  if (suggestion.type === "diagnostic" && (suggestion.suggest || "").toLowerCase().includes("probe_uart") && intentionIds.has("maintain_uart_visibility")) return 1;
  if (suggestion.type === "integration" && intentionIds.has("prepare_integration_setup")) return 1;
  return 0;
}

module.exports = { generateSuggestions };
