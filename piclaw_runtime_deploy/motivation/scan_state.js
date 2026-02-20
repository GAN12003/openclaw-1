"use strict";

/**
 * Gather environment state for the motivation engine. Never throws; returns a safe snapshot.
 * Used by goal_synth and scheduler to decide candidate experiments.
 */

const identityBridge = require("../identity_bridge");

function scanState() {
  const state = {
    integrations_status: { complete: false, missing: [], configured: [] },
    update_available: false,
    goals: { long_term: [], mid_term: [], short_term: [] },
    identity_state: null,
    experiments: { active: [] },
    last_review: null,
    ledger_tail: [],
    disk_free: "n/a",
    uptime_sec: 0,
  };

  try {
    const int = require("../integrations/registry");
    const check = int.checkIntegrations();
    state.integrations_status = {
      complete: check.complete === true,
      missing: Array.isArray(check.missing) ? check.missing : [],
      configured: Array.isArray(check.configured) ? check.configured : [],
    };
  } catch (_) {}

  try {
    const updateState = require("../update_probe/state");
    const versionState = require("../introspection/version_state");
    const probe = updateState.loadProbeState();
    const ver = versionState.getVersionState();
    const current = (ver && ver.version) || "";
    if (probe.last_notified_version && probe.last_notified_version !== current) {
      state.update_available = true;
    }
  } catch (_) {}

  try {
    state.goals = identityBridge.loadGoals() || state.goals;
  } catch (_) {}

  try {
    state.identity_state = identityBridge.loadIdentityState();
  } catch (_) {}

  try {
    state.experiments = identityBridge.loadExperiments() || state.experiments;
  } catch (_) {}

  try {
    state.last_review = identityBridge.getLastReview();
  } catch (_) {}

  try {
    state.ledger_tail = identityBridge.loadLedgerTail(50) || [];
  } catch (_) {}

  try {
    const fsView = require("../introspection/filesystem_view");
    const view = fsView.getView();
    state.disk_free = (view && view.diskFree) || "n/a";
  } catch (_) {}

  try {
    state.uptime_sec = Math.floor(process.uptime());
  } catch (_) {}

  return state;
}

module.exports = { scanState };
