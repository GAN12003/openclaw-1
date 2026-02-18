"use strict";

const identityBridge = require("../identity_bridge");

const DEFAULT_REGISTRY = { devices: [] };

function load() {
  if (!identityBridge.isAvailable()) return { ...DEFAULT_REGISTRY };
  const data = identityBridge.loadUartRegistry();
  return { devices: Array.isArray(data.devices) ? data.devices : [] };
}

/**
 * Replace registry with new devices array. Uses identity_bridge lock + atomic write.
 */
function save(devices) {
  if (!identityBridge.isAvailable()) return false;
  const result = identityBridge.writeUartRegistry({ devices });
  return result === true;
}

module.exports = { load, save };
