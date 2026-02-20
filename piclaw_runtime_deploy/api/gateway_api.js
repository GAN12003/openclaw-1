"use strict";

/**
 * Gateway API — pure functions for the Mini App gateway.
 * No HTTP, no Telegram. Used only by gateway/server.js.
 */

const identityBridge = require("../identity_bridge");
const identity = require("../core/identity");
const registry = require("../uart_identity/registry");
const health = require("../system/health");
const wifi = require("../system/wifi");
const hardwareState = require("../hardware/hardware_state");
const detectPlatform = require("../hardware/detect_platform");
const filesystemView = require("../introspection/filesystem_view");
const processInfo = require("../introspection/process_info");
const versionState = require("../introspection/version_state");
const updateProbe = require("../update_probe/check_remote");

/**
 * Build JSON status for dashboard: health, identity summary, last review, hardware, update.
 */
async function getStatusJson() {
  const [h, w] = await Promise.all([
    health.getHealth(),
    wifi.getWifi(),
  ]);
  const id = identity.loadIdentity();
  const self = identityBridge.isAvailable() ? identityBridge.loadSelf() : null;
  const lastReview = identityBridge.isAvailable() ? identityBridge.getLastReview() : null;
  const fsView = filesystemView.getFilesystemView();
  const proc = processInfo.getProcessInfo();
  const ver = versionState.getVersionState();
  let hardware = { summary: "n/a", uart: { active: false }, gpio: { monitored: [], last_events: [] } };
  if (detectPlatform.isRaspberryPi()) {
    hardware = hardwareState.getHardwareState();
  }
  let update = { update_available: false, current_version: ver.version, latest_version: ver.version };
  try {
    const updateResult = await Promise.race([
      updateProbe.checkRemote(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
    ]).catch(() => null);
    if (updateResult) {
      update = {
        update_available: updateResult.update_available === true,
        current_version: updateResult.current_version,
        latest_version: updateResult.latest_version,
      };
    }
  } catch (_) {}

  return {
    identity: {
      device_id: id.device_id,
      hostname: id.hostname,
      platform: id.platform,
      arch: id.arch,
      first_boot: id.first_boot,
      mission: self?.mission ?? null,
    },
    health: {
      cpu_temp: h.cpuTemp,
      uptime_sec: h.uptimeSec,
      uptime_formatted: health.formatUptime(h.uptimeSec),
    },
    wifi: { ssid: w.ssid, signal: w.signal },
    system: {
      disk_free: fsView.diskFree,
      runtime_dir: fsView.runtimeDir,
      memory_usage: proc.memory_usage,
      pid: proc.pid,
      process_uptime_sec: proc.uptime,
    },
    version: ver.version,
    hardware,
    last_review: lastReview
      ? {
          at: lastReview.at,
          result: lastReview.result,
          duration_ms: lastReview.duration_ms,
          reason: lastReview.reason,
        }
      : null,
    update,
  };
}

/**
 * List UART devices from registry, sorted by last_seen desc.
 */
function getDevices() {
  const data = registry.load();
  const devices = Array.isArray(data.devices) ? data.devices : [];
  const sorted = [...devices].sort((a, b) =>
    (b.last_seen || "").localeCompare(a.last_seen || "")
  );
  return sorted.map((d) => ({
    id: d.id,
    label: d.label ?? null,
    first_seen: d.first_seen ?? null,
    last_seen: d.last_seen ?? null,
    seen_count: d.seen_count ?? 0,
    confidence: d.confidence ?? null,
    fingerprint: d.fingerprint
      ? {
          baud: d.fingerprint.baud,
          traffic: d.fingerprint.traffic,
          signature_hash: d.fingerprint.signature_hash,
        }
      : null,
  }));
}

/**
 * Last review result (read-only).
 */
function getReview() {
  if (!identityBridge.isAvailable()) return null;
  return identityBridge.getLastReview();
}

module.exports = {
  getStatusJson,
  getDevices,
  getReview,
};
