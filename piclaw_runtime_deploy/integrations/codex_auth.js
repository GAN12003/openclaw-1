"use strict";

/**
 * Codex OAuth via Telegram: send auth URL in chat, user pastes redirect URL, we store credentials.
 * Uses @mariozechner/pi-ai loginOpenAICodex with onManualCodeInput so the user pastes in Telegram.
 */

const identityBridge = require("../identity_bridge");

const PENDING_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

const pendingByChat = new Map();

function clearStalePending() {
  const now = Date.now();
  for (const [chatId, entry] of pendingByChat.entries()) {
    if (entry.createdAt && now - entry.createdAt > PENDING_TIMEOUT_MS) {
      try {
        if (typeof entry.reject === "function") entry.reject(new Error("Codex auth timed out"));
      } catch (_) {}
      pendingByChat.delete(chatId);
    }
  }
}

function getPending(chatId) {
  clearStalePending();
  return pendingByChat.get(String(chatId));
}

function setPending(chatId, resolve, reject) {
  pendingByChat.set(String(chatId), {
    resolve,
    reject,
    createdAt: Date.now(),
  });
}

function clearPending(chatId) {
  pendingByChat.delete(String(chatId));
}

const CODEX_INSTRUCTIONS =
  "Open this URL in your browser, sign in, then paste the **full redirect URL** (the page you are redirected to, e.g. starting with https:// or http://localhost:...) here.";

/**
 * Start Codex OAuth flow. Sends auth URL via sendMessage and waits for user to paste redirect in Telegram.
 * When user pastes, call completeCodexLogin(chatId, text). onComplete is called when flow finishes or fails.
 * @param {string} chatId - Telegram chat id
 * @param {{ sendMessage: (text: string) => Promise<void>, onComplete: (err: Error | null, result: { ok: boolean } | null) => void }} options
 */
async function startCodexLogin(chatId, options) {
  const sendMessage = options && typeof options.sendMessage === "function" ? options.sendMessage : () => Promise.resolve();
  const onComplete = options && typeof options.onComplete === "function" ? options.onComplete : () => {};

  if (!identityBridge.isAvailable()) {
    await sendMessage("Identity layer not configured. Set up /opt/piclaw_identity first.");
    onComplete(new Error("identity_unavailable"), null);
    return;
  }

  if (getPending(chatId)) {
    await sendMessage("A Codex login is already waiting for your paste. Send the redirect URL or wait for it to time out.");
    return;
  }

  let deferredResolve;
  let deferredReject;
  const manualPromise = new Promise((resolve, reject) => {
    deferredResolve = resolve;
    deferredReject = reject;
  });

  setPending(chatId, deferredResolve, deferredReject);

  try {
    const { loginOpenAICodex } = await import("@mariozechner/pi-ai");

    const loginPromise = loginOpenAICodex({
      onAuth: ({ url, instructions }) => {
        const text = [url, "", CODEX_INSTRUCTIONS].join("\n");
        sendMessage(text).catch(() => {});
      },
      onPrompt: () => manualPromise,
      onManualCodeInput: () => manualPromise,
      onProgress: () => {},
    });

    loginPromise
      .then((creds) => {
        clearPending(chatId);
        if (!creds || typeof creds !== "object") {
          onComplete(new Error("No credentials returned"), null);
          return;
        }
        const written = identityBridge.writeCodexCredentials({
          access_token: creds.access,
          refresh_token: creds.refresh,
          expires_at: creds.expires,
          account_id: creds.accountId,
        });
        if (written) {
          onComplete(null, { ok: true });
        } else {
          onComplete(new Error("Failed to write credentials"), null);
        }
      })
      .catch((err) => {
        clearPending(chatId);
        onComplete(err instanceof Error ? err : new Error(String(err)), null);
      });
  } catch (err) {
    clearPending(chatId);
    onComplete(err instanceof Error ? err : new Error(String(err)), null);
  }
}

/**
 * Provide the pasted redirect URL for a pending Codex login. Call when the owner sends a message and getPending(chatId) is set.
 * @param {string} chatId - Telegram chat id
 * @param {string} text - Pasted redirect URL or authorization code
 * @returns {boolean} - True if this chat had a pending login and the text was submitted
 */
function completeCodexLogin(chatId, text) {
  const entry = getPending(chatId);
  if (!entry || typeof entry.resolve !== "function") return false;
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return false;
  clearPending(chatId);
  try {
    entry.resolve(value);
  } catch (_) {}
  return true;
}

/**
 * Check if this chat is waiting for a pasted redirect URL (for Telegram message handler).
 * @param {string} chatId
 * @returns {boolean}
 */
function isPendingRedirect(chatId) {
  return !!getPending(chatId);
}

module.exports = {
  startCodexLogin,
  completeCodexLogin,
  isPendingRedirect,
  clearPending,
};
