"use strict";

/**
 * Motivation scheduler: every 45 minutes run scan → synthesize candidates → rank → enqueue top 1–2.
 * First run 8 minutes after start. Failures swallowed; all writes via identity bridge lock + atomic.
 */

const identityBridge = require("../identity_bridge");
const scanState = require("./scan_state").scanState;
const goalSynth = require("./goal_synth").generateCandidates;
const experimentRanker = require("./experiment_ranker").rankAndSelect;

const INTERVAL_MS = 45 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 8 * 60 * 1000;
const TOP_N = 2;

let timerFirst = null;
let timerInterval = null;

function runMotivationCycle() {
  if (!identityBridge.isAvailable()) return;
  try {
    const state = scanState();
    const candidates = goalSynth(state);
    const selected = experimentRanker(candidates, TOP_N);
    if (selected.length === 0) return;

    const experiments = identityBridge.loadExperiments();
    const active = experiments.active || [];
    const existingIds = new Set(active.map((e) => e.id));
    for (const exp of selected) {
      if (exp.id && !existingIds.has(exp.id)) {
        active.push(exp);
        existingIds.add(exp.id);
      }
    }
    identityBridge.writeExperiments({ active });
  } catch (_) {}
}

function start(options) {
  if (timerFirst || timerInterval) return;
  const delay = Math.max(0, (options && options.firstRunDelayMs) ?? FIRST_RUN_DELAY_MS);
  const interval = Math.max(60 * 1000, (options && options.intervalMs) ?? INTERVAL_MS);

  timerFirst = setTimeout(() => {
    timerFirst = null;
    runMotivationCycle();
    timerInterval = setInterval(runMotivationCycle, interval);
  }, delay);
}

function stop() {
  if (timerFirst) {
    clearTimeout(timerFirst);
    timerFirst = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

module.exports = { start, stop, runMotivationCycle };
