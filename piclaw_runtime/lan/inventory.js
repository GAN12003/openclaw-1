"use strict";

const fs = require("fs");
const path = require("path");
const identityBridge = require("../identity_bridge");

function inventoryPath() {
  return path.join(identityBridge.getRoot(), "lan", "devices.json");
}

function loadInventory() {
  try {
    const raw = fs.readFileSync(inventoryPath(), "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return { devices: {} };
  }
}

function saveInventory(data) {
  const p = inventoryPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  identityBridge.withLock(() => {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  });
}

function upsertDevice(device) {
  const inv = loadInventory();
  const key = String(device.mac || device.ip || "").toLowerCase();
  if (!key) return null;
  const prev = inv.devices[key] || {};
  inv.devices[key] = {
    ...prev,
    ...device,
    first_seen: prev.first_seen || new Date().toISOString(),
    last_seen: new Date().toISOString(),
    names: Array.from(new Set([...(prev.names || []), ...(device.names || [])])),
    tags: Array.from(new Set([...(prev.tags || []), ...(device.tags || [])])),
  };
  saveInventory(inv);
  return inv.devices[key];
}

function findDevice(id) {
  const inv = loadInventory();
  const needle = String(id || "").toLowerCase();
  return Object.values(inv.devices).find((d) => String(d.mac || "").toLowerCase() === needle || String(d.ip || "").toLowerCase() === needle) || null;
}

module.exports = { inventoryPath, loadInventory, saveInventory, upsertDevice, findDevice };
