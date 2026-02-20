"use strict";

const DEFAULT_INTERVAL_HOURS = 6;
const FIRST_RUN_DELAY_MS = 10 * 60 * 1000; // 10 minutes

const review = require("./review");

let intervalId = null;

function start() {
  if (intervalId) return;

  const raw = process.env.PICLAW_GOAL_REVIEW_INTERVAL_HOURS || String(DEFAULT_INTERVAL_HOURS);
  const hours = Math.max(0.5, parseFloat(raw) || DEFAULT_INTERVAL_HOURS);
  const intervalMs = Math.round(hours * 60 * 60 * 1000);

  setTimeout(() => {
    try {
      review.runReview();
    } catch (err) {
      console.error("[piclaw] goal_loop first run error:", err.message);
    }
    intervalId = setInterval(() => {
      try {
        review.runReview();
      } catch (err) {
        console.error("[piclaw] goal_loop error:", err.message);
      }
    }, intervalMs);
  }, FIRST_RUN_DELAY_MS);
}

module.exports = { start };
