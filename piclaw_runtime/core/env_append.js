"use strict";

const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env");
const ENV_LOCK_PATH = `${ENV_PATH}.lock`;

/** Only PICLAW_* and OPENAI_* keys may be set via Telegram /set_key (see .env.example). */
const ALLOWED_PREFIXES = ["PICLAW_", "OPENAI_"];

/** Common typos / alternate names from docs → canonical env key (uppercase). */
const SET_KEY_ALIASES = {
  MOLTBOOK_API: "PICLAW_MOLTBOOK_TOKEN",
  MOLTBOOK_TOKEN: "PICLAW_MOLTBOOK_TOKEN",
  PICLAW_MOLTBOOK_API: "PICLAW_MOLTBOOK_TOKEN",
  GITHUB_TOKEN: "PICLAW_GITHUB_PAT",
  GH_TOKEN: "PICLAW_GITHUB_PAT",
};

/**
 * Map user-typed key to the env key we persist (Telegram /set_key).
 * @param {string} key
 * @returns {string}
 */
function normalizeSetKeyName(key) {
  const k = String(key || "").trim().toUpperCase();
  if (!k) return "";
  return SET_KEY_ALIASES[k] || k;
}

function isAllowedKey(key) {
  const k = normalizeSetKeyName(key);
  if (!/^[A-Z][A-Z0-9_]*$/.test(k)) return false;
  return ALLOWED_PREFIXES.some((p) => k.startsWith(p));
}

/** Representative list for /setup (subset; any matching prefix is allowed). */
function getAllowedKeys() {
  return [
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_CHAT_MODEL",
    "OPENAI_REQUEST_TIMEOUT_MS",
    "PICLAW_TELEGRAM_TOKEN",
    "PICLAW_TELEGRAM_CHAT_ID",
    "PICLAW_TELEGRAM_OWNER_USER_IDS",
    "PICLAW_TELEGRAM_GROUP_REPLY_MODE",
    "PICLAW_SUPPRESS_EMBODIMENT_REMINDERS",
    "PICLAW_NOTIFY_WAKE_TELEGRAM",
    "PICLAW_HEALTH_CONNECTIVITY_ALERT_ENABLE",
    "PICLAW_HEALTH_CONNECTIVITY_PROBE_FULL",
    "PICLAW_HEALTH_CONNECTIVITY_LATENCY_MS",
    "PICLAW_TELEGRAM_REACTIONS_ENABLED",
    "PICLAW_TELEGRAM_REACTIONS_OWNER_ONLY",
    "PICLAW_TELEGRAM_REACTION_MAP",
    "PICLAW_TELEGRAM_CHAT_REPLY_THREAD",
    "PICLAW_CHAT_MAX_TOOL_ROUNDS",
    "PICLAW_GITHUB_PAT",
    "PICLAW_GITHUB_USERNAME",
    "PICLAW_GITHUB_ORG",
    "PICLAW_TAILSCALE_AUTHKEY",
    "PICLAW_NOTIFIER_URL",
    "PICLAW_NOTIFIER_HMAC_SECRET",
    "PICLAW_NOTIFIER_AGENT_ID",
    "PICLAW_NOTIFIER_DEFAULT_SEVERITY",
    "PICLAW_COLLECTOR_URL",
    "PICLAW_COLLECTOR_HMAC_SECRET",
    "PICLAW_LOG_SHIP_INTERVAL_MS",
    "PICLAW_ROUTER_CONTROL_ENABLED",
    "PICLAW_FRITZ_HOST",
    "PICLAW_FRITZ_USER",
    "PICLAW_FRITZ_PASSWORD",
    "PICLAW_LAN_TRACK_INTERVAL_MS",
    "PICLAW_AP_SSID",
    "PICLAW_AP_PASSPHRASE",
    "PICLAW_AP_CHANNEL",
    "PICLAW_AP_SUBNET",
    "PICLAW_HANDSHAKE_CAPTURE_ENABLED",
    "PICLAW_DEVICE_WEB_PORT",
    "PICLAW_GIT_CLONE_ROOT",
    "PICLAW_GIT_UPSTREAM_REF",
    "PICLAW_RUNTIME_INSTALL",
    "PICLAW_TWITTER_AUTH_TOKEN",
    "PICLAW_TWITTER_CT0",
    "PICLAW_TWITTER_SCREEN_NAME",
    "PICLAW_SMTP_HOST",
    "PICLAW_SMTP_USER",
    "PICLAW_SMTP_PASS",
    "PICLAW_SMTP_TEST_TO",
    "PICLAW_MOLTBOOK_TOKEN",
    "PICLAW_MONTHLY_BUDGET",
    "PICLAW_WALLET_ADDRESS",
    "PICLAW_WALLET_LABEL",
    "PICLAW_WALLET_ETH_ADDRESS",
    "PICLAW_WALLET_POLYGON_ADDRESS",
    "PICLAW_WALLET_SOLANA_ADDRESS",
    "PICLAW_RPC_ETH_URL",
    "PICLAW_RPC_POLYGON_URL",
    "PICLAW_RPC_SOLANA_URL",
    "PICLAW_WALLET_SIGNING_ENABLED",
    "PICLAW_WALLET_ETH_PRIVATE_KEY",
    "PICLAW_WALLET_SOLANA_PRIVATE_KEY",
    "PICLAW_OPENAI_BUDGET_UNITS_PER_1K_TOTAL",
    "PICLAW_IDENTITY_PATH",
    "PICLAW_LAB_NAME",
    "PICLAW_LAB_ZONE",
    "PICLAW_PHYSICAL_LOCATION",
    "PICLAW_DEPLOYMENT_NOTE",
    "PICLAW_GOAL_REVIEW_INTERVAL_HOURS",
    "PICLAW_AGENCY_INTERVAL_MIN",
    "PICLAW_PRESENCE_INTERVAL_MIN",
    "PICLAW_UPDATE_SOURCE",
    "PICLAW_UPDATE_REPO",
    "PICLAW_UPDATE_URL",
    "PICLAW_UPDATE_INTERVAL_HOURS",
    "PICLAW_GPIO_PINS",
    "PICLAW_GPIO_LOG_ENABLE",
    "PICLAW_GPIO_LOG_PATH",
    "PICLAW_GPIO_LOG_MAX_BYTES",
    "PICLAW_GPIO_CONTROL_ENABLED",
    "PICLAW_GPIO_OUTPUT_WHITELIST",
    "PICLAW_GPIO_MAX_MS",
    "PICLAW_GPIO_MAX_SEC",
    "PICLAW_GPIO_ACTION_COOLDOWN_SEC",
  ];
}

function escapeEnvLine(value) {
  const v = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[\s#"']/.test(v) || v.includes("$")) {
    return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return v;
}

/**
 * Upsert KEY=value in runtime .env (atomic write). Updates process.env for this process.
 * @param {string} key
 * @param {string} value
 * @returns {Promise<{ ok: boolean; reason?: string }>}
 */
async function appendEnv(key, value) {
  const k = normalizeSetKeyName(String(key || "").trim());
  if (!k) return { ok: false, reason: "missing key" };
  if (!isAllowedKey(k)) return { ok: false, reason: "key not allowed" };

  const lineVal = escapeEnvLine(value);

  const lock = await acquireEnvLock();
  if (!lock.ok) return { ok: false, reason: lock.reason || "failed to acquire env lock" };

  const tmp = `${ENV_PATH}.tmp.${process.pid}.${Date.now()}`;
  try {
    let content = "";
    try {
      content = fs.readFileSync(ENV_PATH, "utf8");
    } catch (_) {
      content = "";
    }

    const lines = content.split(/\n/);
    const keyRe = new RegExp("^" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=");
    let found = false;
    const out = lines.map((line) => {
      const t = line.trim();
      if (t && !t.startsWith("#") && keyRe.test(line)) {
        found = true;
        return `${k}=${lineVal}`;
      }
      return line;
    });
    if (!found) {
      out.push(`${k}=${lineVal}`);
    }

    const body = out.join("\n");
    const finalBody = body.endsWith("\n") ? body : `${body}\n`;
    fs.writeFileSync(tmp, finalBody, { mode: 0o600 });
    fs.renameSync(tmp, ENV_PATH);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
    releaseEnvLock(lock.fd);
    return { ok: false, reason: e.message || String(e) };
  }
  releaseEnvLock(lock.fd);

  process.env[k] = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return { ok: true };
}

async function acquireEnvLock(timeoutMs = 5000, pollMs = 50) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const fd = fs.openSync(ENV_LOCK_PATH, "wx", 0o600);
      return { ok: true, fd };
    } catch (e) {
      if (e && e.code !== "EEXIST") return { ok: false, reason: e.message || String(e) };
    }
    await sleep(pollMs);
  }
  return { ok: false, reason: "timeout waiting for env lock" };
}

function releaseEnvLock(fd) {
  try {
    fs.closeSync(fd);
  } catch (_) {}
  try {
    fs.unlinkSync(ENV_LOCK_PATH);
  } catch (_) {}
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { appendEnv, isAllowedKey, getAllowedKeys, normalizeSetKeyName, ENV_PATH };
