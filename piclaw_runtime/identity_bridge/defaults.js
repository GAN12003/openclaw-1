"use strict";

function defaultMeta() {
  return {
    schema_version: 1,
    instance_epoch: 1,
    created_at: new Date().toISOString(),
  };
}

function defaultSelf(deviceId = null, installedAt = null) {
  return {
    device_id: deviceId || null,
    name: "piclaw",
    installed_at: installedAt || new Date().toISOString(),
    owner: "",
    mission: "edge-aware autonomous diagnostics node",
    values: [
      "observe before acting",
      "never damage host system",
      "remain recoverable",
      "prefer reversible actions",
    ],
  };
}

function defaultGoals() {
  return { long_term: [], mid_term: [], short_term: [] };
}

function defaultRelationships() {
  return { humans: {}, agents: {} };
}

function defaultPreferences() {
  return {
    check_updates_hours: 12,
    verbosity: "low",
    exploration_allowed: true,
    self_modify: false,
  };
}

module.exports = {
  defaultMeta,
  defaultSelf,
  defaultGoals,
  defaultRelationships,
  defaultPreferences,
};
