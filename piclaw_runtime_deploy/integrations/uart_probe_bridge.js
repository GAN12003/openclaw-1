"use strict";

const { spawn } = require("child_process");
const path = require("path");

const SCRIPT_PATH = path.join(__dirname, "..", "extensions", "uart_probe", "uart_probe.py");
const PYTHON = process.platform === "win32" ? "python" : "python3";

/**
 * Run read-only UART probe. Spawns python3 uart_probe.py; parses JSON from stdout.
 * Returns { ok, device?, baud?, traffic?, fingerprint?, samples?, reason? }.
 * Never throws; returns ok: false with reason on spawn error or missing Python.
 */
async function runUARTProbe() {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, [SCRIPT_PATH], {
      cwd: path.dirname(SCRIPT_PATH),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", () => resolve({ ok: false, reason: "python_unavailable" }));
    child.on("close", (code) => {
      try {
        const data = JSON.parse(out.trim());
        if (data.ok === true) {
          resolve({
            ok: true,
            device: data.device,
            baud: data.baud,
            traffic: data.traffic,
            fingerprint: data.fingerprint,
            samples: data.samples,
          });
        } else {
          resolve({ ok: false, reason: data.reason || "unknown" });
        }
      } catch (_) {
        resolve({
          ok: false,
          reason: code !== 0 ? `exit_${code}` : "invalid_output",
        });
      }
    });
  });
}

module.exports = { runUARTProbe };
