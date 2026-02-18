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

function isAvailable() {
  return readers.isAvailable();
}

function getLastReview() {
  return readers.getLastReview();
}

function loadUartRegistry() {
  return readers.loadUartRegistry();
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
  isAvailable,
  getLastReview,
  loadUartRegistry,
  readLastUartDecay: readers.readLastUartDecay,
  getRoot: paths.getRoot,
  loadExperiencesTail: readers.loadExperiencesTail,
  loadPreferences: readers.loadPreferences,
  loadMeta: readers.loadMeta,
  withLock: lock.withLock,
  identityDirExists: lock.identityDirExists,
  freezeAvailability: lock.freezeAvailability,
  writeSuggestions: writers.writeSuggestions,
  appendGoalHistory: writers.appendGoalHistory,
  writeLastReview: writers.writeLastReview,
  updateKnowledge: writers.updateKnowledge,
  writeLastReviewHash: writers.writeLastReviewHash,
  readLastReviewHash: writers.readLastReviewHash,
  writeUartRegistry: writers.writeUartRegistry,
  writeLastUartDecay: writers.writeLastUartDecay,
};
