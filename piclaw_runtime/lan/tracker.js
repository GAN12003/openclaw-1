"use strict";

const scan = require("./scan");
const inventory = require("./inventory");
const eventRouter = require("../events/event_router");

let last = new Set();
let timer = null;

function keyOf(d) {
  return `${d.mac || "nomac"}|${d.ip || "noip"}`;
}

async function tick() {
  const r = await scan.scanLan();
  const current = new Set();
  for (const d of r.devices || []) {
    inventory.upsertDevice({
      mac: d.mac,
      ip: d.ip,
      hostname: "",
      metadata: { iface: d.iface },
    });
    const k = keyOf(d);
    current.add(k);
    if (!last.has(k)) {
      eventRouter.emit({
        topic: "lan.device.connected",
        summary: `${d.ip} (${d.mac}) connected`,
        details: d,
        dedupe_key: `connect-${k}`,
      });
    }
  }
  for (const k of last) {
    if (!current.has(k)) {
      eventRouter.emit({
        topic: "lan.device.disconnected",
        summary: `${k} disappeared`,
        details: { key: k },
        dedupe_key: `disconnect-${k}`,
      });
    }
  }
  last = current;
  return { ok: true, count: current.size };
}

function start() {
  if (timer) return;
  const ms = Math.max(5000, Number(process.env.PICLAW_LAN_TRACK_INTERVAL_MS || 30000) || 30000);
  timer = setInterval(() => tick().catch(() => {}), ms);
}

module.exports = { tick, start };
