"use strict";

const dns = require("dns");
const { promisify } = require("util");

const lookup = promisify(dns.lookup);
const TIMEOUT_MS = 2000;

const DEFAULT_AI_API_HOST = "integrate.api.nvidia.com";

function connectivityProbeHost() {
  const raw = (process.env.OPENAI_BASE_URL || "").trim();
  if (!raw) return DEFAULT_AI_API_HOST;
  try {
    return new URL(raw).hostname || DEFAULT_AI_API_HOST;
  } catch {
    return DEFAULT_AI_API_HOST;
  }
}

/**
 * Check if we can reach the internet (DNS resolve of AI API host, default NVIDIA integrate).
 * Returns { online: true } or { online: false } after timeout.
 */
function checkConnectivity() {
  const host = connectivityProbeHost();
  return Promise.race([
    lookup(host).then(() => ({ online: true })).catch(() => ({ online: false })),
    new Promise((resolve) => setTimeout(() => resolve({ online: false }), TIMEOUT_MS)),
  ]);
}

module.exports = { checkConnectivity };
