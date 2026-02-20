"use strict";

const fs = require("fs");
const path = require("path");
const { SAFE_ROOT } = require("../core/self_guard");

/**
 * Read-only scan of runtime "body": config files, extensions, logs, identity.
 * Never modifies anything. Lets Piclaw know where it lives and what is present.
 */
function scanRuntime() {
  let configs = 0;
  let extensions = 0;
  let logs = false;
  let identity = false;
  let identityBridge = null;
  try {
    identityBridge = require("../identity_bridge");
    identity = identityBridge.isAvailable();
  } catch (_) {}
  try {
    const names = fs.readdirSync(SAFE_ROOT);
    for (const n of names) {
      if (n.startsWith(".")) {
        if (n === ".env" || n === ".boot-ok") configs += 1;
        continue;
      }
      if (n.endsWith(".json")) configs += 1;
      if (n === "package.json") configs += 1;
    }
  } catch (_) {}
  const extDir = path.join(SAFE_ROOT, "extensions");
  try {
    if (fs.statSync(extDir).isDirectory()) {
      const entries = fs.readdirSync(extDir);
      extensions = entries.filter((e) => {
        try {
          return fs.statSync(path.join(extDir, e)).isDirectory();
        } catch (_) {
          return false;
        }
      }).length;
    }
  } catch (_) {}
  try {
    const heartbeat = path.join(SAFE_ROOT, "heartbeat.json");
    if (fs.existsSync(heartbeat)) logs = true;
  } catch (_) {}
  if (identity && identityBridge) {
    try {
      const root = identityBridge.getRoot();
      const expPath = path.join(root, "experiences.log");
      if (fs.existsSync(expPath)) logs = true;
    } catch (_) {}
  }
  return { configs, extensions, logs, identity };
}

module.exports = { scanRuntime };
