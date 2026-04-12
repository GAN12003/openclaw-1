"use strict";

function isConfigured() {
  const pat = process.env.PICLAW_GITHUB_PAT;
  /** PAT alone enables HTTP API; username optional (display from /github user API when missing). */
  return !!(pat && pat.trim());
}

module.exports = { isConfigured };
