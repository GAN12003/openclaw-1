"use strict";

const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function requestUpdate() {
  try {
    const { stdout, stderr } = await execFileAsync("piclaw-update", [], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, PATH: process.env.PATH || "/usr/bin:/bin" },
    });
    return { ok: true, stdout: stdout || "", stderr: stderr || "" };
  } catch (e) {
    return {
      ok: false,
      code: e.status ?? (e.signal ? -1 : 1),
      stdout: e.stdout ? String(e.stdout) : "",
      stderr: e.stderr ? String(e.stderr) : (e.message || ""),
    };
  }
}

module.exports = { requestUpdate };
