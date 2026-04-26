"use strict";

const inventory = require("../lan/inventory");
const rtsp = require("./adapters/rtsp");
const cast = require("./adapters/cast");
const airplay = require("./adapters/airplay");
const dlna = require("./adapters/dlna");
const ssh = require("./adapters/ssh");

function find(id) {
  return inventory.findDevice(id);
}

function listCameras() {
  const inv = inventory.loadInventory();
  return Object.values(inv.devices || {}).filter((d) => (d.last_protocols || []).includes("rtsp"));
}

function cameraId(device) {
  return String(device && (device.mac || device.ip || "")).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function findCameraById(id) {
  const wanted = String(id || "").trim();
  const cams = listCameras();
  return cams.find((d) => cameraId(d) === wanted || String(d.ip || "") === wanted || String(d.mac || "") === wanted) || null;
}

function cameraStream(id) {
  const d = findCameraById(id) || find(id);
  if (!d) return { ok: false, reason: "device not found" };
  return { ok: true, id: cameraId(d), url: rtsp.streamUrl(d), device: d };
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
