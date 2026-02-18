"use strict";

const { spawn } = require("child_process");
const path = require("path");

const SCRIPT_PATH = path.join(__dirname, "..", "extensions", "twitter_api", "twitter_check.py");
const PYTHON = process.platform === "win32" ? "python" : "python3";

/**
 * Run Twitter read-only verification via extension in piclaw_runtime/extensions/twitter_api.
 * Spawns python3 twitter_check.py; parses JSON from stdout.
 * No credentials in logs.
 */
async function getTwitterStatus() {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, [SCRIPT_PATH], {
      cwd: path.dirname(SCRIPT_PATH),
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"],
    });

    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.on("error", () => resolve({ ok: false, reason: "spawn_failed" }));
    child.on("close", (code) => {
      try {
        const data = JSON.parse(out.trim());
        if (data.ok === true) {
          resolve({
            ok: true,
            screen_name: data.screen_name || null,
            followers: data.followers ?? 0,
          });
        } else {
          resolve({ ok: false, reason: data.reason || "unknown" });
        }
      } catch (_) {
        resolve({ ok: false, reason: code !== 0 ? `exit_${code}` : "invalid_output" });
      }
    });
  });
}

module.exports = { getTwitterStatus };
