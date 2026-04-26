"use strict";

const lanInventory = require("../lan/inventory");
const radio = require("../radio/mode_manager");
const handshake = require("../radio/handshake_watch");

function getCapabilities() {
  const inv = lanInventory.loadInventory();
  const devices = Object.values((inv && inv.devices) || {});
  return {
    autonomy: "restricted",
    notifier_enabled: Boolean(String(process.env.PICLAW_NOTIFIER_URL || "").trim()),
    collector_enabled: Boolean(String(process.env.PICLAW_COLLECTOR_URL || "").trim()),
    router_control_enabled: String(process.env.PICLAW_ROUTER_CONTROL_ENABLED || "0") === "1",
    handshake_capture_enabled: String(process.env.PICLAW_HANDSHAKE_CAPTURE_ENABLED || "0") === "1",
    radio_mode: radio.getMode(),
    devices_known: devices.length,
    timestamp: new Date().toISOString(),
    handshake: handshake.status(),
  };
}

function toText() {
  const c = getCapabilities();
  return [
    "<b>Capabilities</b>",
    `Autonomy: <code>${c.autonomy}</code>`,
    `Notifier: <code>${c.notifier_enabled ? "enabled" : "disabled"}</code>`,
    `Collector: <code>${c.collector_enabled ? "enabled" : "disabled"}</code>`,
    `Router control: <code>${c.router_control_enabled ? "enabled" : "disabled"}</code>`,
    `Radio mode: <code>${c.radio_mode}</code>`,
    `Devices known: <code>${c.devices_known}</code>`,
    `Handshake capture: <code>${c.handshake_capture_enabled ? "enabled" : "disabled"}</code>`,
  ].join("\n");
}

module.exports = { getCapabilities, toText };
