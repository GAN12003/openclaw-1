"use strict";

const net = require("net");
const inventory = require("../lan/inventory");

function probePort(host, port, timeoutMs = 900) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { s.destroy(); } catch (_) {}
      resolve(ok);
    };
    s.setTimeout(timeoutMs);
    s.once("connect", () => finish(true));
    s.once("timeout", () => finish(false));
    s.once("error", () => finish(false));
    s.connect(port, host);
  });
}

async function discoverCapabilities(device) {
  const ip = device && device.ip ? String(device.ip) : "";
  if (!ip) return [];
  const caps = [];
  if (await probePort(ip, 554)) caps.push("rtsp");
  if (await probePort(ip, 22)) caps.push("ssh");
  if (await probePort(ip, 80)) caps.push("http");
  if (await probePort(ip, 443)) caps.push("https");
  if (await probePort(ip, 8009)) caps.push("chromecast");
  if (await probePort(ip, 7000)) caps.push("airplay");
  return caps;
}

async function refreshAll() {
  const inv = inventory.loadInventory();
  const devices = Object.values(inv.devices || {});
  const out = [];
  for (const d of devices) {
    const caps = await discoverCapabilities(d);
    const merged = inventory.upsertDevice({ ...d, last_protocols: caps, metadata: { ...(d.metadata || {}), protocols_refreshed_at: new Date().toISOString() } });
    out.push(merged);
  }
  return out;
}

module.exports = { discoverCapabilities, refreshAll };
