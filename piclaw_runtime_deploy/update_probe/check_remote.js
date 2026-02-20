"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");

const VERSION_FILE = path.join(__dirname, "..", "version.json");

/**
 * Parse "0.1.0" or "v0.1.0" into [major, minor, patch]. Non-numeric parts become 0.
 */
function parseSemver(s) {
  if (typeof s !== "string") return [0, 0, 0];
  const cleaned = s.replace(/^v/i, "").trim();
  const parts = cleaned.split(".").map((p) => parseInt(p, 10));
  return [
    Number.isNaN(parts[0]) ? 0 : parts[0],
    Number.isNaN(parts[1]) ? 0 : parts[1],
    Number.isNaN(parts[2]) ? 0 : parts[2],
  ];
}

/**
 * Compare two semver strings. Returns: 1 if a > b, -1 if a < b, 0 if equal.
 */
function compareSemver(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (va[i] > vb[i]) return 1;
    if (va[i] < vb[i]) return -1;
  }
  return 0;
}

function getLocalVersion() {
  try {
    const raw = fs.readFileSync(VERSION_FILE, "utf8");
    const data = JSON.parse(raw);
    return (data.version && String(data.version).trim()) || "0.0.0";
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  return "0.0.0";
}

function get(url, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = { ...options };
    if (!opts.headers) opts.headers = {};
    if (!opts.headers["User-Agent"]) opts.headers["User-Agent"] = "Piclaw-Update-Probe/1.0";
    const req = https.get(url, opts, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    });
    req.setTimeout(15_000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

/**
 * Check if a newer version exists. Returns { update_available, latest_version, current_version }.
 * No writes. Fails silently (returns update_available: false) on network/parse errors.
 */
async function checkRemote() {
  const current_version = getLocalVersion();
  const source = (process.env.PICLAW_UPDATE_SOURCE || "").toLowerCase().trim();
  let latest_version = current_version;

  try {
    if (source === "github") {
      const repo = (process.env.PICLAW_UPDATE_REPO || "").trim();
      if (!repo) return { update_available: false, latest_version: current_version, current_version };
      const url = `https://api.github.com/repos/${repo}/releases/latest`;
      const body = await get(url);
      const data = JSON.parse(body);
      const tag = data.tag_name;
      if (tag) latest_version = String(tag).replace(/^v/i, "").trim();
    } else if (source === "url") {
      const url = (process.env.PICLAW_UPDATE_URL || "").trim();
      if (!url) return { update_available: false, latest_version: current_version, current_version };
      const body = await get(url);
      const data = JSON.parse(body);
      if (data.version) latest_version = String(data.version).trim();
    } else {
      return { update_available: false, latest_version: current_version, current_version };
    }
  } catch (_) {
    return { update_available: false, latest_version: current_version, current_version };
  }

  const update_available = compareSemver(latest_version, current_version) > 0;
  return { update_available, latest_version, current_version };
}

module.exports = { checkRemote, compareSemver, getLocalVersion };
