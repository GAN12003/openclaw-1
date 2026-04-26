"use strict";

const inventory = require("../lan/inventory");
const rtsp = require("./adapters/rtsp");
const cast = require("./adapters/cast");
const airplay = require("./adapters/airplay");
const dlna = require("./adapters/dlna");
const ssh = require("./adapters/ssh");

function configuredCameras() {
  const raw = String(process.env.PICLAW_CAMERAS_JSON || "").trim();
  if (!raw) return [];
  const candidates = [raw];
  // .env may preserve escaped quotes (e.g. [{\"id\":\"...\"}]); try a de-escaped variant too.
  if (raw.includes('\\"')) {
    candidates.push(raw.replace(/\\"/g, '"'));
  }
  // Some setups may still carry one extra wrapping quote layer.
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    candidates.push(raw.slice(1, -1));
  }
  let parsed = null;
  for (const c of candidates) {
    try {
      const j = JSON.parse(c);
      if (Array.isArray(j)) {
        parsed = j;
        break;
      }
    } catch (_) {}
  }
  if (!parsed) return [];
  return parsed
    .map((c) => ({
      id: String(c.id || "").trim(),
      name: String(c.name || "").trim(),
      ip: String(c.ip || "").trim(),
      urls: Array.isArray(c.urls) ? c.urls.map((u) => String(u || "").trim()).filter(Boolean) : [],
    }))
    .filter((c) => c.id && c.urls.length > 0);
}

function find(id) {
  return inventory.findDevice(id);
}

function listCameras() {
  const inv = inventory.loadInventory();
  const discovered = Object.values(inv.devices || {})
    .filter((d) => (d.last_protocols || []).includes("rtsp"))
    .map((d) => ({
      source: "discovered",
      id: cameraId(d),
      name: ((d.names || [])[0] || "").trim(),
      ip: d.ip || "",
      urls: [rtsp.streamUrl(d)].filter(Boolean),
      device: d,
    }));
  const manual = configuredCameras().map((c) => ({
    source: "configured",
    id: c.id,
    name: c.name,
    ip: c.ip,
    urls: c.urls,
    device: null,
  }));
  const byId = new Map();
  for (const c of [...discovered, ...manual]) {
    if (!byId.has(c.id)) byId.set(c.id, c);
  }
  return Array.from(byId.values());
}

function cameraId(device) {
  return String(device && (device.mac || device.ip || "")).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function findCameraById(id) {
  const wanted = String(id || "").trim();
  const cams = listCameras();
  return cams.find((d) => d.id === wanted || String(d.ip || "") === wanted) || null;
}

function cameraStream(id) {
  const c = findCameraById(id);
  if (c) return { ok: true, id: c.id, name: c.name || "", urls: c.urls, url: c.urls[0], device: c.device, source: c.source };
  const d = find(id);
  if (!d) return { ok: false, reason: "device not found" };
  return { ok: true, id: cameraId(d), name: ((d.names || [])[0] || "").trim(), urls: [rtsp.streamUrl(d)].filter(Boolean), url: rtsp.streamUrl(d), device: d, source: "discovered" };
}

async function speakerPlay(id, url) {
  const d = find(id);
  if (!d) return { ok: false, reason: "device not found" };
  const proto = d.last_protocols || [];
  if (proto.includes("chromecast")) return cast.play(d, url);
  if (proto.includes("airplay")) return airplay.play(d, url);
  return dlna.play(d, url);
}

async function tvOff(id) {
  const d = find(id);
  if (!d) return { ok: false, reason: "device not found" };
  return { ok: true, note: "tv power-off scaffold", device: d };
}

async function desktopRun(id, command) {
  const d = find(id);
  if (!d) return { ok: false, reason: "device not found" };
  return ssh.run(d, command);
}

module.exports = { find, listCameras, cameraId, findCameraById, cameraStream, speakerPlay, tvOff, desktopRun };
