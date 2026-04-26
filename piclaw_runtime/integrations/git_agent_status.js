"use strict";

const { execFile, spawn } = require("child_process");
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

async function getCurrentBranch(root) {
  const { stdout } = await execFileAsync("git", ["-C", root, "rev-parse", "--abbrev-ref", "HEAD"], {
    timeout: 10000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  return String(stdout || "").trim() || "HEAD";
}

async function getTrackedUpstream(root) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
      timeout: 10000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
    const out = String(stdout || "").trim();
    return out || null;
  } catch (_) {
    return null;
  }
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
  const configuredUpstream = getUpstreamRef();
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
    const branch = await getCurrentBranch(root);
    const tracked = await getTrackedUpstream(root);
    const upstream = configuredUpstream || tracked || "origin/main";
    const { stdout: countOut } = await execFileAsync(
      "git",
      ["-C", root, "rev-list", "--count", `HEAD..${upstream}`],
      { timeout: 15000, maxBuffer: 64 * 1024, windowsHide: true }
    );
    const behind = Number(String(countOut || "").trim()) || 0;
    const { stdout: lrOut } = await execFileAsync(
      "git",
      ["-C", root, "rev-list", "--left-right", "--count", `${upstream}...HEAD`],
      { timeout: 15000, maxBuffer: 64 * 1024, windowsHide: true }
    );
    const parts = String(lrOut || "").trim().split(/\s+/);
    const behindLr = Number(parts[0] || 0) || 0;
    const aheadLr = Number(parts[1] || 0) || 0;
    const { stdout: logOut } = await execFileAsync(
      "git",
      ["-C", root, "log", "--oneline", `HEAD..${upstream}`, "-n", "20"],
      { timeout: 15000, maxBuffer: 256 * 1024, windowsHide: true }
    );
    const lines = [
      `<b>Git updates</b>`,
      `clone: <code>${root}</code>`,
      `branch: <code>${escapeHtml(branch)}</code>`,
      `tracked upstream: <code>${escapeHtml(tracked || "(none)")}</code>`,
      `upstream: <code>${upstream}</code>`,
      `commits behind upstream: <b>${behind}</b>`,
      `ahead/behind vs upstream: <b>${aheadLr}</b>/<b>${behindLr}</b>`,
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
    const { stdout: diff } = await execFileAsync("git", ["-C", root, "diff", "--stat"], {
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
  return new Promise((resolve) => {
    const child = spawn("bash", [script], {
      env: { ...process.env, PATH: process.env.PATH || "/usr/bin:/bin" },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const maxBuffer = 4 * 1024 * 1024;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (buf) => {
      stdout += String(buf || "");
      if (stdout.length > maxBuffer) stdout = stdout.slice(-maxBuffer);
    });
    child.stderr.on("data", (buf) => {
      stderr += String(buf || "");
      if (stderr.length > maxBuffer) stderr = stderr.slice(-maxBuffer);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr, error: e.message || String(e) });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0 && !timedOut) {
        resolve({ ok: true, stdout, stderr });
        return;
      }
      const reason = timedOut
        ? `update timed out after ${timeoutMs}ms`
        : `update failed (code=${code == null ? "null" : code}, signal=${signal || "none"})`;
      resolve({ ok: false, stdout, stderr, error: reason });
    });
  });
}

module.exports = {
  getGitCloneRoot,
  getUpstreamRef,
  getUpdateScriptPath,
  showUpdates,
  suggestGit,
  runAgentRuntimeUpdate,
};
