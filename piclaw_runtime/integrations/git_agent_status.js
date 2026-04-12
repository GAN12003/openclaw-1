"use strict";

const { execFile } = require("child_process");
const { promisify } = require("util");
const os = require("os");
const path = require("path");

const execFileAsync = promisify(execFile);

function getGitCloneRoot() {
  const raw = (process.env.PICLAW_GIT_CLONE_ROOT || "").trim();
  if (raw) {
    const expanded = raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1).replace(/^\//, "")) : raw;
    return path.resolve(expanded);
  }
  return path.join(os.homedir(), "src", "openclaw-1");
}

function getUpstreamRef() {
  return (process.env.PICLAW_GIT_UPSTREAM_REF || "origin/main").trim() || "origin/main";
}

function getUpdateScriptPath() {
  return path.join(__dirname, "..", "scripts", "agent-runtime-update.sh");
}

/**
 * @param {number} timeoutMs
 * @returns {Promise<{ ok: boolean; text?: string; error?: string }>}
 */
async function showUpdates(timeoutMs = 90000) {
  const root = getGitCloneRoot();
  const upstream = getUpstreamRef();
  try {
    await execFileAsync("git", ["-C", root, "fetch", "origin"], {
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (e) {
    return { ok: false, error: `git fetch: ${e.message || String(e)}` };
  }
  try {
    const { stdout: countOut } = await execFileAsync(
      "git",
      ["-C", root, "rev-list", "--count", `HEAD..${upstream}`],
      { timeout: 15000, maxBuffer: 64 * 1024, windowsHide: true }
    );
    const behind = Number(String(countOut || "").trim()) || 0;
    const { stdout: logOut } = await execFileAsync(
      "git",
      ["-C", root, "log", "--oneline", `HEAD..${upstream}`, "-n", "20"],
      { timeout: 15000, maxBuffer: 256 * 1024, windowsHide: true }
    );
    const lines = [
      `<b>Git updates</b>`,
      `clone: <code>${root}</code>`,
      `upstream: <code>${upstream}</code>`,
      `commits behind upstream: <b>${behind}</b>`,
      "",
      behind ? "<pre>" + escapeHtml(logOut.trim() || "(empty)") + "</pre>" : "<i>Up to date with upstream tip on this branch.</i>",
    ];
    return { ok: true, text: lines.join("\n") };
  } catch (e) {
    return { ok: false, error: `git log: ${e.message || String(e)}` };
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @returns {Promise<{ ok: boolean; text?: string; error?: string }>}
 */
async function suggestGit(timeoutMs = 30000) {
  const root = getGitCloneRoot();
  try {
    const { stdout: st } = await execFileAsync("git", ["-C", root, "status", "-sb"], {
      timeout: timeoutMs,
      maxBuffer: 512 * 1024,
      windowsHide: true,
    });
    const { stdout: diff } = await execFileAsync("git", ["-C", root, "diff", "--stat", "--max-count=80"], {
      timeout: timeoutMs,
      maxBuffer: 512 * 1024,
      windowsHide: true,
    });
    const body = [st.trim(), "", diff.trim()].join("\n").trim();
    const capped = body.length > 3500 ? body.slice(0, 3500) + "\n…(truncated)" : body;
    return { ok: true, text: `<b>Git working tree</b>\n<code>${root}</code>\n<pre>${escapeHtml(capped || "(clean)")}</pre>` };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Runs bundled update script (git pull, rsync runtime, npm, systemctl restart).
 * @returns {Promise<{ ok: boolean; stdout?: string; stderr?: string; error?: string }>}
 */
async function runAgentRuntimeUpdate(timeoutMs = 600000) {
  const script = getUpdateScriptPath();
  const fs = require("fs");
  if (!fs.existsSync(script)) {
    return { ok: false, error: `Update script missing: ${script}` };
  }
  try {
    const { stdout, stderr } = await execFileAsync("bash", [script], {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, PATH: process.env.PATH || "/usr/bin:/bin" },
    });
    return { ok: true, stdout: stdout || "", stderr: stderr || "" };
  } catch (e) {
    const stdout = e.stdout != null ? String(e.stdout) : "";
    const stderr = e.stderr != null ? String(e.stderr) : "";
    return {
      ok: false,
      stdout,
      stderr,
      error: e.message || String(e),
    };
  }
}

module.exports = {
  getGitCloneRoot,
  getUpstreamRef,
  getUpdateScriptPath,
  showUpdates,
  suggestGit,
  runAgentRuntimeUpdate,
};
