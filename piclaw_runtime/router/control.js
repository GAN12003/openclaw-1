"use strict";

const fritz = require("./fritz_tr064");
const eventRouter = require("../events/event_router");
const inventory = require("../lan/inventory");

function disabled() {
  return { ok: false, reason: "PICLAW_ROUTER_CONTROL_ENABLED=0" };
}

async function routerStatus() {
  const r = await fritz.getStatus();
  eventRouter.emit({
    topic: "router.status",
    severity: r.ok ? "info" : "warn",
    summary: r.ok ? "router reachable" : `router status failed: ${r.reason || "unknown"}`,
    details: r,
    dedupe_key: "router-status",
  });
  return r;
}

async function listDevices() {
  const inv = inventory.loadInventory();
  const devices = Object.values((inv && inv.devices) || {}).map((d) => ({
    id: d.mac || d.ip || "",
    ip: d.ip || "",
    mac: d.mac || "",
    names: d.names || [],
    tags: d.tags || [],
    protocols: d.last_protocols || [],
    source: "lan_inventory",
  }));
  if (!fritz.enabled()) {
    return { ok: true, router_control_enabled: false, devices, note: "Router write-control disabled; showing read-only LAN inventory." };
  }
  return { ok: true, router_control_enabled: true, devices, note: "Read-only list via LAN inventory. TR-064 host parser can be added next." };
}

async function wifiSet(enabled, band) {
  if (!fritz.enabled()) return disabled();
  const b = String(band || "all");
  eventRouter.emit({
    topic: "router.wifi.toggle",
    severity: "warn",
    summary: `requested wifi ${enabled ? "on" : "off"} for ${b}`,
    details: { enabled: !!enabled, band: b },
    dedupe_key: `wifi-${enabled ? "on" : "off"}-${b}`,
  });
  return { ok: true, note: "command recorded; full SOAP action wiring pending per model variant" };
}

async function suspendDevice(mac) {
  if (!fritz.enabled()) return disabled();
  eventRouter.emit({
    topic: "router.device.suspend",
    summary: `suspend requested for ${mac}`,
    details: { mac: String(mac || "") },
    dedupe_key: `suspend-${mac}`,
  });
  return { ok: true, note: "suspend request recorded; full SOAP action wiring pending" };
}

async function unsuspendDevice(mac) {
  if (!fritz.enabled()) return disabled();
  eventRouter.emit({
    topic: "router.device.unsuspend",
    summary: `unsuspend requested for ${mac}`,
    details: { mac: String(mac || "") },
    dedupe_key: `unsuspend-${mac}`,
  });
  return { ok: true, note: "unsuspend request recorded; full SOAP action wiring pending" };
}

module.exports = { routerStatus, listDevices, wifiSet, suspendDevice, unsuspendDevice };
