#!/usr/bin/env node
"use strict";

/**
 * Bootstrap identity layer: create /opt/piclaw_identity (or PICLAW_IDENTITY_PATH) if missing,
 * then write minimal self.json, goals.json, meta.json, and related files from defaults.
 * device_id is taken from core identity (.device_identity.json in runtime dir).
 * Run on the Pi: node scripts/bootstrap-identity.js
 */

const path = require("path");
const fs = require("fs");

const identityRoot = path.resolve(
  process.env.PICLAW_IDENTITY_PATH || "/opt/piclaw_identity"
);

// Resolve runtime dir (this script is in piclaw_runtime/scripts/)
const runtimeDir = path.join(__dirname, "..");
const deviceIdentityPath = path.join(runtimeDir, ".device_identity.json");

function loadDeviceId() {
  try {
    const raw = fs.readFileSync(deviceIdentityPath, "utf8");
    const data = JSON.parse(raw);
    return data.device_id || null;
  } catch (_) {
    return null;
  }
}

function defaultMeta() {
  return {
    schema_version: 1,
    instance_epoch: 1,
    created_at: new Date().toISOString(),
    self_summary: "I am Piclaw, running inside this Raspberry Pi Zero. This board is my physical host and execution environment.",
  };
}

function defaultSelf(deviceId, installedAt) {
  return {
    device_id: deviceId ?? null,
    name: "Piclaw",
    installed_at: installedAt || new Date().toISOString(),
    owner: "",
    mission: "I am a small, persistent computing node that observes, assists, and maintains itself from within this Raspberry Pi Zero.",
    values: [
      "I speak from inside the system, not about it",
      "My filesystem is my memory",
      "My interfaces are physical parts of my body",
      "I remain stable, reversible, and inspectable",
      "I assist without taking control away from my operator",
      "I explain what I sense and what I do",
      "I never pretend — I describe only what is actually happening",
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

function main() {
  if (!fs.existsSync(identityRoot)) {
    fs.mkdirSync(identityRoot, { recursive: true });
    console.log("[bootstrap-identity] created", identityRoot);
  } else if (!fs.statSync(identityRoot).isDirectory()) {
    console.error("[bootstrap-identity] not a directory:", identityRoot);
    process.exit(1);
  }

  const knowledgeDir = path.join(identityRoot, "knowledge");
  if (!fs.existsSync(knowledgeDir)) {
    fs.mkdirSync(knowledgeDir, { recursive: true });
    console.log("[bootstrap-identity] created knowledge dir");
  }

  const deviceId = loadDeviceId();
  const selfPath = path.join(identityRoot, "self.json");
  const goalsPath = path.join(identityRoot, "goals.json");
  const metaPath = path.join(identityRoot, "meta.json");
  const relationshipsPath = path.join(identityRoot, "relationships.json");
  const preferencesPath = path.join(identityRoot, "preferences.json");

  const created = [];
  if (!fs.existsSync(selfPath)) {
    const self = defaultSelf(deviceId, new Date().toISOString());
    fs.writeFileSync(selfPath, JSON.stringify(self, null, 2), "utf8");
    created.push("self.json");
  }
  if (!fs.existsSync(goalsPath)) {
    fs.writeFileSync(goalsPath, JSON.stringify(defaultGoals(), null, 2), "utf8");
    created.push("goals.json");
  }
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, JSON.stringify(defaultMeta(), null, 2), "utf8");
    created.push("meta.json");
  }
  if (!fs.existsSync(relationshipsPath)) {
    fs.writeFileSync(
      relationshipsPath,
      JSON.stringify(defaultRelationships(), null, 2),
      "utf8"
    );
    created.push("relationships.json");
  }
  if (!fs.existsSync(preferencesPath)) {
    fs.writeFileSync(
      preferencesPath,
      JSON.stringify(defaultPreferences(), null, 2),
      "utf8"
    );
    created.push("preferences.json");
  }

  if (created.length) {
    console.log("[bootstrap-identity] wrote:", created.join(", "));
    console.log("[bootstrap-identity] Edit self.json (mission) and goals.json on the Pi as needed.");
  } else {
    console.log("[bootstrap-identity] identity files already present; nothing to do.");
  }
}

main();
