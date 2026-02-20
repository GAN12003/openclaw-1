"use strict";

const github = require("./github_identity");
const twitter = require("./twitter_identity");
const mail = require("./mail_identity");
const moltbook = require("./moltbook_identity");

const REQUIRED = ["github", "twitter", "smtp", "moltbook"];

const checkers = {
  github: () => github.isConfigured(),
  twitter: () => twitter.isConfigured(),
  smtp: () => mail.isConfigured(),
  moltbook: () => moltbook.isConfigured(),
};

function checkIntegrations() {
  const configured = [];
  const missing = [];
  for (const name of REQUIRED) {
    if (checkers[name]()) configured.push(name);
    else missing.push(name);
  }
  return {
    complete: missing.length === 0,
    missing,
    configured,
  };
}

module.exports = { checkIntegrations, REQUIRED };
