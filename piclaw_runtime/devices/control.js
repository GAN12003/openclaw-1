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

function cameraStream(id) {
  const d = find(id);
  if (!d) return { ok: false, reason: "device not found" };
  return { ok: true, url: rtsp.streamUrl(d), device: d };
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

module.exports = { find, cameraStream, speakerPlay, tvOff, desktopRun };
