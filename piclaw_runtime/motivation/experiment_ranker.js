"use strict";

/**
 * Score candidate experiments: (expected_value * (1 - risk)) - cost_estimate.
 * Builder-Researcher: high weight on value, moderate cost, tolerate some risk.
 * Select top N (default 2) for execution.
 */

function scoreExperiment(exp) {
  if (!exp || typeof exp !== "object") return -Infinity;
  const ev = typeof exp.expected_value === "number" ? exp.expected_value : 0;
  const risk = typeof exp.risk === "number" ? Math.max(0, Math.min(1, exp.risk)) : 0.5;
  const cost = typeof exp.cost_estimate === "number" ? Math.max(0, exp.cost_estimate) : 0;
  return ev * (1 - risk) - cost;
}

function rankAndSelect(candidates, topN) {
  const n = Math.max(1, Math.min(10, typeof topN === "number" ? topN : 2));
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const withScores = candidates.map((c) => ({ candidate: c, score: scoreExperiment(c) }));
  withScores.sort((a, b) => b.score - a.score);
  return withScores.slice(0, n).map((x) => x.candidate);
}

module.exports = { scoreExperiment, rankAndSelect };
