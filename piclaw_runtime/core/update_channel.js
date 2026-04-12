"use strict";

const { execSync } = require("child_process");

function requestUpdate() {
  try {
    execSync("piclaw-update", { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      code: e.status ?? (e.signal ? -1 : 1),
      stdout: e.stdout || "",
      stderr: e.stderr || e.message || "",
    };
  }
}

module.exports = { requestUpdate };
