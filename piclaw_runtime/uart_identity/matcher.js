"use strict";

const fingerprint = require("./fingerprint");
const registry = require("./registry");
const identityBridge = require("../identity_bridge");

const MAX_UART_DEVICES = 64;
const WRITE_THROTTLE_MS = 5000;

/**
 * First 8 hex chars (32 bits) to avoid collisions at scale.
 * ID length is fixed once written; never re-derive IDs for existing devices.
 */
function shortId(signatureHash) {
  return (signatureHash || "").slice(0, 8);
}

/**
 * Identify device from probe result. Match by signature_hash; update last_seen/seen_count or register new.
 * Near match: return hint only, do not persist.
 * @param { { ok: boolean, device?: string, baud?: number, traffic?: string, fingerprint?: string, samples?: number } } probeResult
 * @returns { Promise<{ device: object | null, isNew: boolean, rejected?: string, confidenceHint?: string }> }
 */
async function identifyDevice(probeResult) {
  if (!probeResult || !probeResult.ok) {
    return { device: null, isNew: false };
  }
  if (!identityBridge.isAvailable()) {
    return { device: null, isNew: false };
  }

  const fp = fingerprint.fingerprintFromProbe(probeResult);
  const id = "uart-" + shortId(fp.signature_hash);
  const now = new Date().toISOString();

  const data = registry.load();
  const devices = [...(data.devices || [])];

  const exactMatch = devices.find(
    (d) => d.fingerprint && d.fingerprint.signature_hash === fp.signature_hash
  );
  if (exactMatch) {
    const previousLastSeen = exactMatch.last_seen;
    const previousMs = previousLastSeen ? new Date(previousLastSeen).getTime() : 0;
    const shouldSave = previousMs === 0 || Date.now() - previousMs >= WRITE_THROTTLE_MS;
    if (shouldSave) {
      exactMatch.last_seen = now;
      exactMatch.seen_count = (exactMatch.seen_count || 0) + 1;
      if (exactMatch.confidence != null && exactMatch.confidence < 1) {
        exactMatch.confidence = Math.min(1, (exactMatch.confidence || 0) + 0.1);
      }
      if (exactMatch.last_sample_hash !== undefined && exactMatch.last_sample_hash !== fp.sample_hash) {
        exactMatch.last_sample_hash = fp.sample_hash;
        identityBridge.appendExperience("uart device " + exactMatch.id + " changed banner");
      } else if (exactMatch.last_sample_hash === undefined) {
        exactMatch.last_sample_hash = fp.sample_hash;
      }
      registry.save(devices);
    }
    return { device: exactMatch, isNew: false };
  }

  const nearMatch = devices.find(
    (d) =>
      d.fingerprint &&
      d.fingerprint.baud === fp.baud &&
      (d.fingerprint.traffic || "").toLowerCase() === fp.traffic
  );
  if (nearMatch) {
    return {
      device: nearMatch,
      isNew: false,
      confidenceHint: "near match (same baud+traffic)",
    };
  }

  if (devices.length >= MAX_UART_DEVICES) {
    identityBridge.appendExperience("registry full, ignoring new UART fingerprint");
    return { device: null, isNew: false, rejected: "registry_full" };
  }

  const newDevice = {
    id,
    first_seen: now,
    last_seen: now,
    fingerprint: {
      baud: fp.baud,
      traffic: fp.traffic,
      signature_hash: fp.signature_hash,
    },
    last_sample_hash: fp.sample_hash,
    label: null,
    confidence: 0.6,
    seen_count: 1,
  };
  devices.push(newDevice);
  identityBridge.appendExperience(
    "discovered uart device " + id + " (" + (fp.traffic || "?") + "@" + (fp.baud ?? "?") + ")"
  );
  registry.save(devices);
  return { device: newDevice, isNew: true };
}

module.exports = { identifyDevice };
