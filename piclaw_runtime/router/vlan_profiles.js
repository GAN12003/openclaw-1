"use strict";

const fs = require("fs");
const path = require("path");
const identityBridge = require("../identity_bridge");

function pathForProfiles() {
  return path.join(identityBridge.getRoot(), "lan", "profiles.json");
}

function listProfiles() {
  try {
    return JSON.parse(fs.readFileSync(pathForProfiles(), "utf8"));
  } catch (_) {
    return { profiles: [] };
  }
}

function saveProfiles(data) {
  const p = pathForProfiles();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  identityBridge.withLock(() => fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8"));
}

function createProfile(name, vlan, subnet) {
  const data = listProfiles();
  const profile = { name, vlan, subnet, agents: [], created_at: new Date().toISOString() };
  data.profiles = (data.profiles || []).filter((p) => p.name !== name);
  data.profiles.push(profile);
  saveProfiles(data);
  return profile;
}

function joinAgent(name, agentId) {
  const data = listProfiles();
  const p = (data.profiles || []).find((x) => x.name === name);
  if (!p) return null;
  p.agents = Array.from(new Set([...(p.agents || []), agentId]));
  saveProfiles(data);
  return p;
}

module.exports = { pathForProfiles, listProfiles, saveProfiles, createProfile, joinAgent };
