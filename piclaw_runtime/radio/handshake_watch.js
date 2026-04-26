"use strict";

const fs = require("fs");
const path = require("path");
const { runShellCommand } = require("../core/exec_run");
const identityBridge = require("../identity_bridge");
const eventRouter = require("../events/event_router");

function baseDir() {
  return path.join(identityBridge.getRoot(), "handshakes");
}

function status() {
  const enabled = String(process.env.PICLAW_HANDSHAKE_CAPTURE_ENABLED || "0") === "1";
  const dir = baseDir();
  let count = 0;
  try {
    count = fs.readdirSync(dir).filter((x) => x.endsWith(".pcap")).length;
  } catch (_) {}
  return { enabled, dir, count };
}

async function captureOnce(seconds = 20) {
  if (String(process.env.PICLAW_HANDSHAKE_CAPTURE_ENABLED || "0") !== "1") {
    return { ok: false, reason: "PICLAW_HANDSHAKE_CAPTURE_ENABLED=0" };
  }
  fs.mkdirSync(baseDir(), { recursive: true });
  const file = path.join(baseDir(), `capture-${Date.now()}.pcap`);
  const cmd = `timeout ${Math.max(5, Number(seconds) || 20)} tcpdump -i wlan1mon -e -s 0 -w ${JSON.stringify(file)}`;
  const r = await runShellCommand(cmd);
  eventRouter.emit({
    topic: "wifi.handshake.capture",
    severity: r.code === 0 ? "info" : "warn",
    summary: r.code === 0 ? `capture saved ${file}` : "capture failed",
    details: { file, code: r.code, stderr: r.stderr ? String(r.stderr).slice(-300) : "" },
    dedupe_key: `capture-${Math.floor(Date.now() / 30000)}`,
  });
  return { ok: r.code === 0, file, code: r.code, stderr: r.stderr || "" };
}

module.exports = { status, captureOnce };
