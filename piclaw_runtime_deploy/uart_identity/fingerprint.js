"use strict";

const crypto = require("crypto");

const MAX_SAMPLE_CHARS = 200;

/**
 * Normalize sample text: strip numbers (replace digit sequences with 'x'), collapse whitespace, trim.
 * @param {string} s
 * @returns {string}
 */
function normalize(s) {
  if (typeof s !== "string") return "";
  let t = s
    .replace(/\d+/g, "x")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, MAX_SAMPLE_CHARS);
}

/**
 * Build a stable string from probe result for fingerprinting (when raw samples not available).
 */
function buildSampleFromProbe(probeResult) {
  const device = probeResult.device || "";
  const baud = probeResult.baud != null ? String(probeResult.baud) : "";
  const traffic = probeResult.traffic || "";
  const fp = probeResult.fingerprint || "";
  return [device, baud, traffic, fp].join("|");
}

/**
 * Compute signature hash: normalize then sha1.
 * @param {string} sample - Raw or built sample string.
 * @returns {string} Hex sha1.
 */
function signatureHash(sample) {
  const norm = normalize(sample);
  return crypto.createHash("sha1").update(norm).digest("hex");
}

/**
 * Sample hash: sha1 of raw built sample (no normalization). Used only after exact match to detect banner change.
 */
function sampleHash(sample) {
  return crypto.createHash("sha1").update(sample).digest("hex");
}

/**
 * Compute fingerprint from probe result. Uses built sample (device|baud|traffic|fingerprint).
 * signature_hash = normalized (for matching); sample_hash = raw (for change detection only).
 */
function fingerprintFromProbe(probeResult) {
  const sample = buildSampleFromProbe(probeResult);
  const signature_hash = signatureHash(sample);
  const sample_hash = sampleHash(sample);
  return {
    baud: probeResult.baud ?? null,
    traffic: (probeResult.traffic || "").toLowerCase(),
    signature_hash,
    sample_hash,
  };
}

module.exports = {
  normalize,
  buildSampleFromProbe,
  signatureHash,
  sampleHash,
  fingerprintFromProbe,
};
