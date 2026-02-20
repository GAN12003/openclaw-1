"use strict";

function isConfigured() {
  const host = process.env.PICLAW_SMTP_HOST;
  const user = process.env.PICLAW_SMTP_USER;
  const pass = process.env.PICLAW_SMTP_PASS;
  return !!(host && host.trim() && user && user.trim() && pass && pass.trim());
}

module.exports = { isConfigured };
