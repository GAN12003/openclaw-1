"use strict";

const dns = require("dns");
const net = require("net");
const { promisify } = require("util");

const lookup = promisify(dns.lookup);
const DNS_TIMEOUT_MS = 2000;
const TCP_TIMEOUT_MS = 3000;

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
 * TCP connect to host:port; returns ms to "connect", or null on failure/timeout.
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<number | null>}
 */
function measureTcpConnectMs(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const socket = net.createConnection({ host, port }, () => {
      clearTimeout(timer);
      const ms = Date.now() - t0;
      try {
        socket.destroy();
      } catch (_) {}
      resolve(ms);
    });
    const timer = setTimeout(() => {
      try {
        socket.destroy();
      } catch (_) {}
      resolve(null);
    }, timeoutMs);
    socket.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

/**
 * DNS-only probe (fast). `online` true if lookup succeeds.
 * @returns {Promise<{ online: boolean, dns_ms: number | null, tcp_ms: null, latency_ms: null }>}
 */
async function probeDnsOnly() {
  const host = connectivityProbeHost();
  const wall0 = Date.now();
  try {
    await Promise.race([
      lookup(host),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), DNS_TIMEOUT_MS)),
    ]);
    return { online: true, dns_ms: Date.now() - wall0, tcp_ms: null, latency_ms: null };
  } catch {
    return { online: false, dns_ms: null, tcp_ms: null, latency_ms: null };
  }
}

/**
 * DNS + TCP connect to AI API host (port 443). `online` true only if TCP succeeds.
 * @returns {Promise<{ online: boolean, dns_ms: number | null, tcp_ms: number | null, latency_ms: number | null }>}
 */
async function probeDnsAndTcp() {
  const host = connectivityProbeHost();
  const wall0 = Date.now();
  let dns_ms = null;
  try {
    const tDns = Date.now();
    await Promise.race([
      lookup(host),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), DNS_TIMEOUT_MS)),
    ]);
    dns_ms = Date.now() - tDns;
  } catch {
    return { online: false, dns_ms: null, tcp_ms: null, latency_ms: null };
  }

  const tcp_ms = await measureTcpConnectMs(host, 443, TCP_TIMEOUT_MS);
  if (tcp_ms == null) {
    return { online: false, dns_ms, tcp_ms: null, latency_ms: null };
  }
  const latency_ms = Date.now() - wall0;
  return { online: true, dns_ms, tcp_ms, latency_ms };
}

/**
 * @param {{ full?: boolean }} [opts] — full=true runs DNS + TCP (latency); default false = DNS only (cheap for frequent senseEnv).
 */
async function checkConnectivity(opts) {
  const full = opts && opts.full === true;
  if (full) {
    return probeDnsAndTcp();
  }
  return probeDnsOnly();
}

module.exports = { checkConnectivity, connectivityProbeHost, probeDnsOnly, probeDnsAndTcp };
