"use strict";

const { execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");

const execFileAsync = promisify(execFile);

const INSTALL_TAILSCALE_SCRIPT = path.join(__dirname, "..", "scripts", "install-tailscale.sh");

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getLocalIp() {
  try {
    const ifaces = os.networkInterfaces();
    const order = ["wlan0", "eth0"];
    for (const name of order) {
      const list = ifaces[name];
      if (!list) continue;
      const v4 = list.find((i) => i.family === "IPv4" && !i.internal);
      if (v4) return { iface: name, ip: v4.address };
    }
    for (const [name, list] of Object.entries(ifaces)) {
      const v4 = (list || []).find((i) => i.family === "IPv4" && !i.internal);
      if (v4) return { iface: name, ip: v4.address };
    }
  } catch (_) {}
  return { iface: null, ip: null };
}

/**
 * Public IP via api.ipify.org (HTTPS, 3s timeout). Returns null on failure.
 * Kept dependency-free (no curl) so it works whatever is on the Pi.
 */
function getPublicIp(timeoutMs = 3000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    try {
      const req = https.get(
        { host: "api.ipify.org", path: "/", timeout: timeoutMs, headers: { "user-agent": "piclaw" } },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return finish(null);
          }
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => { body += c; if (body.length > 64) req.destroy(); });
          res.on("end", () => finish((body || "").trim() || null));
        }
      );
      req.on("timeout", () => { req.destroy(); finish(null); });
      req.on("error", () => finish(null));
    } catch (_) {
      finish(null);
    }
  });
}

async function isTailscaleInstalled() {
  try {
    await execFileAsync("tailscale", ["version"], { timeout: 3000, windowsHide: true });
    return true;
  } catch (_) {
    return false;
  }
}

async function getTailscaleStatus() {
  if (!(await isTailscaleInstalled())) {
    return { installed: false, ip4: null, ip6: null, state: null, hostname: null };
  }
  let ip4 = null;
  let ip6 = null;
  let state = null;
  let hostname = null;
  try {
    const { stdout } = await execFileAsync("tailscale", ["ip", "-4"], { timeout: 3000, windowsHide: true });
    ip4 = (stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null;
  } catch (_) {}
  try {
    const { stdout } = await execFileAsync("tailscale", ["ip", "-6"], { timeout: 3000, windowsHide: true });
    ip6 = (stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null;
  } catch (_) {}
  try {
    const { stdout } = await execFileAsync("tailscale", ["status", "--json"], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    const parsed = JSON.parse(stdout || "{}");
    state = parsed.BackendState || null;
    hostname = (parsed.Self && (parsed.Self.HostName || parsed.Self.DNSName)) || null;
  } catch (_) {}
  return { installed: true, ip4, ip6, state, hostname };
}

/**
 * Aggregate snapshot used by the /net Telegram command.
 * @returns {Promise<{
 *   hostname: string,
 *   localIp: { iface: string|null, ip: string|null },
 *   publicIp: string|null,
 *   tailscale: { installed: boolean, ip4: string|null, ip6: string|null, state: string|null, hostname: string|null },
 *   sshd: { active: boolean|null }
 * }>}
 */
async function getNetInfo() {
  const [publicIp, tailscale, sshd] = await Promise.all([
    getPublicIp(3000),
    getTailscaleStatus(),
    getSshdStatus(),
  ]);
  return {
    hostname: os.hostname(),
    localIp: getLocalIp(),
    publicIp,
    tailscale,
    sshd,
  };
}

async function getSshdStatus() {
  try {
    const { stdout } = await execFileAsync("systemctl", ["is-active", "ssh"], {
      timeout: 3000,
      windowsHide: true,
    });
    return { active: String(stdout || "").trim() === "active" };
  } catch (e) {
    const stdout = e && e.stdout ? String(e.stdout).trim() : "";
    if (stdout) return { active: stdout === "active" };
    return { active: null };
  }
}

/** HTML for Telegram /net. */
async function getNetInfoHtml() {
  const info = await getNetInfo();
  const lines = [];
  lines.push("<b>Network</b>");
  lines.push(`Host: <code>${escapeHtml(info.hostname)}</code>`);
  lines.push(
    `Local: <code>${escapeHtml(info.localIp.ip || "n/a")}</code>` +
      (info.localIp.iface ? ` (${escapeHtml(info.localIp.iface)})` : "")
  );
  lines.push(`Public: <code>${escapeHtml(info.publicIp || "n/a")}</code>`);
  lines.push("");
  lines.push("<b>Tailscale</b>");
  if (!info.tailscale.installed) {
    lines.push("Not installed. Send <code>/install_tailscale</code> after setting <code>PICLAW_TAILSCALE_AUTHKEY</code>.");
  } else {
    lines.push(`State: <code>${escapeHtml(info.tailscale.state || "unknown")}</code>`);
    lines.push(`IPv4:  <code>${escapeHtml(info.tailscale.ip4 || "n/a")}</code>`);
    if (info.tailscale.hostname) {
      lines.push(`Name:  <code>${escapeHtml(info.tailscale.hostname)}</code>`);
    }
    if (info.tailscale.ip4) {
      lines.push(`SSH:   <code>ssh ${escapeHtml(process.env.USER || "pi")}@${escapeHtml(info.tailscale.ip4)}</code>`);
    }
  }
  lines.push("");
  lines.push("<b>SSH service</b>");
  lines.push(
    info.sshd.active === true
      ? "active"
      : info.sshd.active === false
        ? "inactive"
        : "unknown"
  );
  return lines.join("\n");
}

/**
 * Run the install-tailscale.sh script with the auth key from env.
 * On success, clears PICLAW_TAILSCALE_AUTHKEY from runtime .env (single-use).
 *
 * @returns {Promise<{ ok: boolean, stdout?: string, stderr?: string, error?: string, status?: object, redacted?: boolean }>}
 */
async function runInstallTailscale({ appendEnv } = {}) {
  if (!fs.existsSync(INSTALL_TAILSCALE_SCRIPT)) {
    return { ok: false, error: `Install script missing: ${INSTALL_TAILSCALE_SCRIPT}` };
  }
  const authKey = (process.env.PICLAW_TAILSCALE_AUTHKEY || "").trim();
  // Allow no-key path (script will report status if already authenticated).
  let stdout = "";
  let stderr = "";
  let ok = false;
  let error;
  try {
    const r = await execFileAsync("bash", [INSTALL_TAILSCALE_SCRIPT], {
      timeout: 600000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, PATH: process.env.PATH || "/usr/bin:/bin" },
    });
    stdout = r.stdout || "";
    stderr = r.stderr || "";
    ok = true;
  } catch (e) {
    stdout = e && e.stdout ? String(e.stdout) : "";
    stderr = e && e.stderr ? String(e.stderr) : "";
    error = e && e.message ? e.message : String(e);
  }

  const status = parseScriptKv(stdout);
  let redacted = false;
  if (ok && authKey && typeof appendEnv === "function") {
    try {
      const r = await appendEnv("PICLAW_TAILSCALE_AUTHKEY", "");
      redacted = !!(r && r.ok);
    } catch (_) {
      redacted = false;
    }
  }
  return { ok, stdout, stderr, error, status, redacted };
}

function parseScriptKv(stdout) {
  const out = {};
  for (const raw of String(stdout || "").split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

module.exports = {
  getLocalIp,
  getPublicIp,
  getTailscaleStatus,
  getSshdStatus,
  getNetInfo,
  getNetInfoHtml,
  runInstallTailscale,
};
