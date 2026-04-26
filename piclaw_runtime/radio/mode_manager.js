"use strict";

const { runShellCommand } = require("../core/exec_run");
const eventRouter = require("../events/event_router");

let mode = "idle";

function getMode() {
  return mode;
}

async function setMode(next) {
  const n = String(next || "").toLowerCase();
  if (!["idle", "client", "ap", "monitor"].includes(n)) return { ok: false, reason: "invalid mode" };
  if (n === mode) return { ok: true, mode };
  if (n === "ap") await runShellCommand("bash scripts/piclaw/setup-wlan1-ap.sh");
  if (n === "monitor") await runShellCommand("bash scripts/piclaw/setup-wlan1-monitor.sh");
  if (n === "idle") await runShellCommand("ip link set wlan1 down || true");
  mode = n;
  eventRouter.emit({
    topic: "radio.mode.changed",
    summary: `radio mode -> ${mode}`,
    details: { mode },
    dedupe_key: `radio-mode-${mode}`,
  });
  return { ok: true, mode };
}

module.exports = { getMode, setMode };
