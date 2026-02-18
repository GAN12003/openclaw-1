"use strict";

function isConfigured() {
  const token = process.env.PICLAW_MOLTBOOK_TOKEN;
  return !!(token && token.trim());
}

module.exports = { isConfigured };
