"use strict";

/**
 * Evaluate goals against recent experiences. Classify each goal as active | stalled | achieved | obsolete.
 * Does not create or delete goals; only annotates.
 */

const STALLED_DAYS = 7;
const EXPERIENCES_TAIL = 200;

/**
 * @param { { long_term: string[], mid_term: string[], short_term: string[] } } goals
 * @param { string[] } experienceLines - last N lines of experiences.log (newest at end)
 * @param { Record<string, unknown> } knowledge
 * @returns { Array<{ goal: string, horizon: string, status: 'active'|'stalled'|'achieved'|'obsolete' }> }
 */
function evaluateGoals(goals, experienceLines, knowledge) {
  const results = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  function hasRecentActivity(keyword, withinDays) {
    const cutoff = now - withinDays * dayMs;
    for (let i = experienceLines.length - 1; i >= 0; i--) {
      const line = experienceLines[i];
      const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
      if (tsMatch) {
        const lineDate = new Date(tsMatch[1]).getTime();
        if (lineDate < cutoff) break;
        if (line.toLowerCase().includes(keyword.toLowerCase())) return true;
      }
    }
    return false;
  }

  const horizons = [
    { key: "long_term", list: goals.long_term || [] },
    { key: "mid_term", list: goals.mid_term || [] },
    { key: "short_term", list: goals.short_term || [] },
  ];

  for (const { key, list } of horizons) {
    for (const goal of list) {
      if (!goal || typeof goal !== "string") continue;
      const g = String(goal).trim();
      if (!g) continue;

      let status = "active";
      const lower = g.toLowerCase();

      if (lower.includes("uart") || lower.includes("learn")) {
        if (!hasRecentActivity("uart", STALLED_DAYS) && !hasRecentActivity("learn", STALLED_DAYS)) {
          status = "stalled";
        }
      }

      results.push({ goal: g, horizon: key, status });
    }
  }

  return results;
}

module.exports = { evaluateGoals };
