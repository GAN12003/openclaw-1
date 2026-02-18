"use strict";

const crypto = require("crypto");

const MAX_AUTH_AGE_SEC = 86400; // 1 day

/**
 * Validate Telegram Mini App initData (query string).
 * Algorithm: secret_key = HMAC-SHA256("WebAppData", bot_token);
 *            computed_hash = HMAC-SHA256(secret_key, data_check_string).hex
 * @param {string} initData - Raw query string from Telegram WebApp.initData
 * @param {string} botToken - PICLAW_TELEGRAM_TOKEN
 * @returns {{ valid: boolean, userId?: string, reason?: string }}
 */
function validateInitData(initData, botToken) {
  if (!initData || typeof initData !== "string" || !botToken || !botToken.trim()) {
    return { valid: false, reason: "missing_init_data_or_token" };
  }
  const params = new URLSearchParams(initData.trim());
  const hash = params.get("hash");
  if (!hash) {
    return { valid: false, reason: "hash_missing" };
  }
  const authDate = params.get("auth_date");
  if (authDate) {
    const ts = parseInt(authDate, 10);
    if (Number.isNaN(ts) || Date.now() / 1000 - ts > MAX_AUTH_AGE_SEC) {
      return { valid: false, reason: "init_data_expired" };
    }
  }
  const dataCheckParts = [];
  for (const key of [...params.keys()].sort()) {
    if (key === "hash") continue;
    dataCheckParts.push(`${key}=${params.get(key)}`);
  }
  const dataCheckString = dataCheckParts.join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (computedHash !== hash) {
    return { valid: false, reason: "invalid_signature" };
  }
  let userId = null;
  const userStr = params.get("user");
  if (userStr) {
    try {
      const user = JSON.parse(decodeURIComponent(userStr));
      if (user && typeof user.id === "number") userId = String(user.id);
    } catch (_) {}
  }
  return { valid: true, userId: userId || undefined };
}

/**
 * Check if request is allowed: valid initData and optional owner match.
 * @param {string} initData
 * @param {string} botToken
 * @param {string} [allowedOwnerTelegramId] - from self.owner or PICLAW_MINI_APP_OWNER_TELEGRAM_ID
 */
function isAllowed(initData, botToken, allowedOwnerTelegramId) {
  const result = validateInitData(initData, botToken);
  if (!result.valid) return { allowed: false, reason: result.reason };
  if (allowedOwnerTelegramId && allowedOwnerTelegramId.trim() !== "") {
    const allowed = allowedOwnerTelegramId.trim();
    if (result.userId && result.userId !== allowed) {
      return { allowed: false, reason: "owner_mismatch" };
    }
  }
  return { allowed: true };
}

module.exports = { validateInitData, isAllowed };
