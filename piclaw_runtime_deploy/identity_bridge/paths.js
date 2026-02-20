"use strict";

const path = require("path");

/** Resolved once at load. Default /opt/piclaw_identity; override via PICLAW_IDENTITY_PATH. */
const IDENTITY_ROOT = path.resolve(
  process.env.PICLAW_IDENTITY_PATH || "/opt/piclaw_identity"
);

function getRoot() {
  return IDENTITY_ROOT;
}

function selfPath() {
  return path.join(IDENTITY_ROOT, "self.json");
}

function relationshipsPath() {
  return path.join(IDENTITY_ROOT, "relationships.json");
}

function goalsPath() {
  return path.join(IDENTITY_ROOT, "goals.json");
}

function experiencesPath() {
  return path.join(IDENTITY_ROOT, "experiences.log");
}

function experiencesRotatedPath() {
  return path.join(IDENTITY_ROOT, "experiences.1.log");
}

function knowledgePath(topic) {
  const safe = (topic || "").replace(/[^a-z0-9_]/gi, "") || "observations";
  return path.join(IDENTITY_ROOT, "knowledge", `${safe}.json`);
}

function preferencesPath() {
  return path.join(IDENTITY_ROOT, "preferences.json");
}

function metaPath() {
  return path.join(IDENTITY_ROOT, "meta.json");
}

function lockPath() {
  return path.join(IDENTITY_ROOT, ".lock");
}

function goalHistoryPath() {
  return path.join(IDENTITY_ROOT, "goal_history.log");
}

function goalHistoryRotatedPath() {
  return path.join(IDENTITY_ROOT, "goal_history.1.log");
}

function suggestionsPath() {
  return path.join(IDENTITY_ROOT, "suggestions.json");
}

function intentionsPath() {
  return path.join(IDENTITY_ROOT, "intentions.json");
}

function identityStatePath() {
  return path.join(IDENTITY_ROOT, "identity_state.json");
}

function experimentsPath() {
  return path.join(IDENTITY_ROOT, "experiments.json");
}

function ledgerPath() {
  return path.join(IDENTITY_ROOT, "ledger.jsonl");
}

function lastReviewPath() {
  return path.join(IDENTITY_ROOT, "last_review.json");
}

function lastReviewHashPath() {
  return path.join(IDENTITY_ROOT, ".last_review_hash");
}

function uartRegistryPath() {
  return path.join(IDENTITY_ROOT, "uart_registry.json");
}

function lastUartDecayPath() {
  return path.join(IDENTITY_ROOT, ".last_uart_decay");
}

function codexCredentialsPath() {
  return path.join(IDENTITY_ROOT, "codex_credentials.json");
}

module.exports = {
  getRoot,
  selfPath,
  relationshipsPath,
  goalsPath,
  experiencesPath,
  experiencesRotatedPath,
  knowledgePath,
  preferencesPath,
  metaPath,
  lockPath,
  goalHistoryPath,
  goalHistoryRotatedPath,
  suggestionsPath,
  intentionsPath,
  identityStatePath,
  experimentsPath,
  ledgerPath,
  lastReviewPath,
  lastReviewHashPath,
  uartRegistryPath,
  lastUartDecayPath,
  codexCredentialsPath,
};
