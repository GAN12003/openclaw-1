"use strict";

const readers = require("./readers");
const writers = require("./writers");
const validate = require("./validate");

function loadSelf() {
  return readers.loadSelf();
}

function loadGoals() {
  return readers.loadGoals();
}

function loadRelationships() {
  return readers.loadRelationships();
}

function appendExperience(event) {
  const line = typeof event === "string" ? event : JSON.stringify(event);
  return writers.appendExperience(line);
}

function loadKnowledge(topic) {
  return readers.loadKnowledge(topic);
}

function validateIdentity() {
  return validate.validateIdentity();
}

function warnIdentityPermissions() {
  return validate.warnIdentityPermissions();
}

function checkStrictIdentityPermissions() {
  return validate.checkStrictIdentityPermissions();
}

function isAvailable() {
  return readers.isAvailable();
}

function getLastReview() {
  return readers.getLastReview();
}

function loadUartRegistry() {
  return readers.loadUartRegistry();
}

function loadSuggestions() {
  return readers.loadSuggestions();
}

function loadIntentions() {
  return readers.loadIntentions();
}

function loadIdentityState() {
  return readers.loadIdentityState();
}

function loadExperiments() {
  return readers.loadExperiments();
}

function loadLedgerTail(n) {
  return readers.loadLedgerTail(n);
}

// Export for goal_loop and Telegram
const paths = require("./paths");
const lock = require("./lock");

module.exports = {
  loadSelf,
  loadGoals,
  loadRelationships,
  appendExperience,
  loadKnowledge,
  validateIdentity,
  warnIdentityPermissions,
  checkStrictIdentityPermissions,
  isAvailable,
  getLastReview,
  loadUartRegistry,
  loadSuggestions,
  loadIntentions,
  readLastUartDecay: readers.readLastUartDecay,
  getRoot: paths.getRoot,
  loadExperiencesTail: readers.loadExperiencesTail,
  loadPreferences: readers.loadPreferences,
  loadMeta: readers.loadMeta,
  getSelfSummary: readers.getSelfSummary,
  getWritingStyle: readers.getWritingStyle,
  writeSelfSummary: writers.writeSelfSummary,
  writeWritingStyle: writers.writeWritingStyle,
  withLock: lock.withLock,
  identityDirExists: lock.identityDirExists,
  freezeAvailability: lock.freezeAvailability,
  writeSuggestions: writers.writeSuggestions,
  writeIntentions: writers.writeIntentions,
  appendGoalHistory: writers.appendGoalHistory,
  writeLastReview: writers.writeLastReview,
  updateKnowledge: writers.updateKnowledge,
  writeLastReviewHash: writers.writeLastReviewHash,
  readLastReviewHash: writers.readLastReviewHash,
  writeUartRegistry: writers.writeUartRegistry,
  writeLastUartDecay: writers.writeLastUartDecay,
  loadIdentityState,
  loadExperiments,
  loadLedgerTail,
  writeIdentityState: writers.writeIdentityState,
  writeExperiments: writers.writeExperiments,
  appendLedgerLine: writers.appendLedgerLine,
  ensureDailyBudgetReset: writers.ensureDailyBudgetReset,
  loadCodexCredentials: readers.loadCodexCredentials,
  writeCodexCredentials: writers.writeCodexCredentials,
};
