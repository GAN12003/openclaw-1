"use strict";

const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env");

/** Only PICLAW_* and OPENAI_* keys may be set via Telegram /set_key (see .env.example). */
const ALLOWED_PREFIXES = ["PICLAW_", "OPENAI_"];

function isAllowedKey(key) {
  const k = String(key || "").trim();
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
    "PICLAW_GITHUB_PAT",
    "PICLAW_GITHUB_USERNAME",
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
    "PICLAW_IDENTITY_PATH",
    "PICLAW_GOAL_REVIEW_INTERVAL_HOURS",
    "PICLAW_AGENCY_INTERVAL_MIN",
    "PICLAW_PRESENCE_INTERVAL_MIN",
    "PICLAW_UPDATE_SOURCE",
    "PICLAW_UPDATE_REPO",
    "PICLAW_UPDATE_URL",
    "PICLAW_UPDATE_INTERVAL_HOURS",
    "PICLAW_GPIO_PINS",
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
  const k = String(key || "").trim();
  if (!k) return { ok: false, reason: "missing key" };
  if (!isAllowedKey(k)) return { ok: false, reason: "key not allowed" };

  const lineVal = escapeEnvLine(value);

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
  const tmp = `${ENV_PATH}.tmp`;
  try {
    fs.writeFileSync(tmp, finalBody, { mode: 0o600 });
    fs.renameSync(tmp, ENV_PATH);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
    return { ok: false, reason: e.message || String(e) };
  }

  process.env[k] = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return { ok: true };
}

module.exports = { appendEnv, isAllowedKey, getAllowedKeys, ENV_PATH };
