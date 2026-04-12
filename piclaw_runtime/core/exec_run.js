"use strict";

const { exec } = require("child_process");
const path = require("path");
const util = require("util");

const execAsync = util.promisify(exec);

/** Directory containing piclaw.js (parent of core/). */
const RUNTIME_ROOT = path.resolve(path.join(__dirname, ".."));
const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Run a shell command with cwd = runtime root. Used by the chat "exec" tool.
 * @param {string} command
 * @returns {Promise<{ stdout: string; stderr: string; code: number }>}
 */
async function runShellCommand(command) {
  const cmd = String(command || "").trim();
  if (!cmd) {
    return { stdout: "", stderr: "", code: 1 };
  }
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: RUNTIME_ROOT,
      maxBuffer: MAX_BUFFER,
      shell: true,
      env: { ...process.env },
    });
    return { stdout: stdout || "", stderr: stderr || "", code: 0 };
  } catch (err) {
    const stdout = err.stdout != null ? String(err.stdout) : "";
    const stderr = err.stderr != null ? String(err.stderr) : String(err.message || "");
    const code = typeof err.code === "number" ? err.code : 1;
    return { stdout, stderr, code };
  }
}

module.exports = { runShellCommand, RUNTIME_ROOT };
