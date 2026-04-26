"use strict";

const { runShellCommand } = require("../../core/exec_run");

async function run(device, command) {
  const host = device && device.ip ? String(device.ip) : "";
  if (!host) return { ok: false, reason: "missing device ip" };
  const sshCmd = `ssh -o BatchMode=yes -o ConnectTimeout=5 ${JSON.stringify(host)} ${JSON.stringify(String(command || "hostname"))}`;
  const r = await runShellCommand(sshCmd);
  return { ok: r.code === 0, stdout: r.stdout, stderr: r.stderr, code: r.code };
}

module.exports = { run };
