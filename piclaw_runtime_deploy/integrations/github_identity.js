"use strict";

function isConfigured() {
  const pat = process.env.PICLAW_GITHUB_PAT;
  const user = process.env.PICLAW_GITHUB_USERNAME;
  return !!(pat && pat.trim() && user && user.trim());
}

module.exports = { isConfigured };
