"use strict";

const { isSuppressEmbodimentReminders } = require("../core/embodiment_reminders");

/**
 * Generate candidate experiments from current scan state. Builder-Researcher bias:
 * opportunism + experimentation; small reversible moves. Phase 1: only actions repo_scan, update_check, probe_uart, notify_owner.
 */

function generateCandidates(scanState) {
  const candidates = [];
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const idPrefix = `exp-${today.replace(/-/g, "")}-`;

  if (!scanState || typeof scanState !== "object") return candidates;

  const missing = (scanState.integrations_status && scanState.integrations_status.missing) || [];
  const updateAvailable = scanState.update_available === true;

  let seq = 1;
  function nextId() {
    return idPrefix + String(seq++).padStart(3, "0");
  }

  if (missing.length > 0 && !isSuppressEmbodimentReminders()) {
    candidates.push({
      id: nextId(),
      title: "Notify owner about missing integrations",
      hypothesis: "Reminding owner about missing setup will unblock external presence.",
      expected_value: 0.7,
      cost_estimate: 0.05,
      risk: 0.1,
      action_plan: [{ type: "notify_owner", reason: "Integrations missing: " + missing.join(", ") }],
      status: "queued",
      created_at: now,
    });
  }

  if (updateAvailable) {
    candidates.push({
      id: nextId(),
      title: "Check for updates",
      hypothesis: "Confirming update availability keeps the node current.",
      expected_value: 0.5,
      cost_estimate: 0.02,
      risk: 0.05,
      action_plan: [{ type: "update_check" }],
      status: "queued",
      created_at: now,
    });
  }

  candidates.push({
    id: nextId(),
    title: "UART visibility probe",
    hypothesis: "Probing UART keeps device visibility and registry fresh.",
    expected_value: 0.4,
    cost_estimate: 0.01,
    risk: 0.05,
    action_plan: [{ type: "probe_uart" }],
    status: "queued",
    created_at: now,
  });

  candidates.push({
    id: nextId(),
    title: "Repo scan (read-only)",
    hypothesis: "Scanning repo improves self-model and suggests improvements.",
    expected_value: 0.35,
    cost_estimate: 0.02,
    risk: 0.0,
    action_plan: [{ type: "repo_scan" }],
    status: "queued",
    created_at: now,
  });

  return candidates;
}

module.exports = { generateCandidates };
