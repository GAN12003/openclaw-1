"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { SAFE_ROOT } = require("./self_guard");

const RUNTIME_ROOT = SAFE_ROOT;

async function getSelfInspectionAsync() {
  let diskFree = "n/a";
  try {
    const out = execSync("df -h .", { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
    const lines = out.trim().split("\n");
    if (lines.length >= 2) {
      const header = lines[0].split(/\s+/);
      const data = lines[1].split(/\s+/);
      const availIdx = header.findIndex((h) => h === "Avail" || h === "Available");
      if (availIdx >= 0 && data[availIdx]) diskFree = data[availIdx];
      else if (data.length >= 4) diskFree = data[3];
    }
  } catch (_) {}

  let writable_runtime = false;
  try {
    const testFile = path.join(RUNTIME_ROOT, ".inspect-write-test");
    fs.writeFileSync(testFile, "ok", "utf8");
    fs.unlinkSync(testFile);
    writable_runtime = true;
  } catch (_) {}

  let python_available = null;
  try {
    execSync("python3 --version", { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] });
    python_available = true;
  } catch (_) {
    try {
      execSync("python --version", { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] });
      python_available = true;
    } catch (_) {
      python_available = false;
    }
  }

  const extDir = path.join(RUNTIME_ROOT, "extensions");
  let extensions_detected = [];
  try {
    if (fs.existsSync(extDir)) {
      extensions_detected = fs.readdirSync(extDir).filter((n) => {
        const p = path.join(extDir, n);
        return fs.statSync(p).isDirectory() && n !== "README.md";
      });
    }
  } catch (_) {}

  let version = "unknown";
  try {
    const vPath = path.join(RUNTIME_ROOT, "version.json");
    if (fs.existsSync(vPath)) {
      const v = JSON.parse(fs.readFileSync(vPath, "utf8"));
      version = v.version || version;
    }
  } catch (_) {}

  const cur = path.join(RUNTIME_ROOT, "..", "current");
  let slot = "n/a";
  try {
    if (fs.existsSync(cur)) {
      const resolved = fs.realpathSync(cur);
      slot = path.basename(resolved);
    }
  } catch (_) {}

  const integrations = require("../integrations/registry");
  const intStatus = integrations.checkIntegrations();

  return {
    writable_runtime,
    python_available,
    extensions_detected,
    disk_free: diskFree,
    version,
    slot,
    integrations_configured: intStatus,
  };
}

module.exports = { getSelfInspectionAsync };
