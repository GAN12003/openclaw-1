"use strict";

const dns = require("dns");
const { promisify } = require("util");

const lookup = promisify(dns.lookup);
const TIMEOUT_MS = 2000;

/**
 * Check if we can reach the internet (DNS resolve of api.openai.com).
 * Returns { online: true } or { online: false } after timeout.
 */
function checkConnectivity() {
  return Promise.race([
    lookup("api.openai.com").then(() => ({ online: true })).catch(() => ({ online: false })),
    new Promise((resolve) => setTimeout(() => resolve({ online: false }), TIMEOUT_MS)),
  ]);
}

module.exports = { checkConnectivity };
