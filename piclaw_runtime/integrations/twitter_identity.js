"use strict";

function isConfigured() {
  const auth = process.env.PICLAW_TWITTER_AUTH_TOKEN;
  const ct0 = process.env.PICLAW_TWITTER_CT0;
  return !!(auth && auth.trim() && ct0 && ct0.trim());
}

module.exports = { isConfigured };
