"use strict";

const os = require("os");
const { runShellCommand } = require("../core/exec_run");

function parseIpNeigh(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\S+)\s+dev\s+(\S+)\s+lladdr\s+([0-9a-f:]{17})/i);
      if (!m) return null;
      return { ip: m[1], iface: m[2], mac: m[3].toLowerCase() };
    })
    .filter(Boolean);
}

async function scanLan() {
  const devices = [];
  const neigh = await runShellCommand("ip neigh");
  if (neigh.code === 0) {
    devices.push(...parseIpNeigh(neigh.stdout));
  }
  const ifs = os.networkInterfaces();
  const local = Object.values(ifs)
    .flat()
    .filter((x) => x && x.family === "IPv4" && !x.internal)
    .map((x) => x.address);
  return { ts: new Date().toISOString(), local, devices };
}

module.exports = { scanLan };
