"use strict";

const TelegramBot = require("node-telegram-bot-api");
const { normalizeSetKeyName } = require("../core/env_append");
const snippets = require("./telegram_snippets");
const telegramReactions = require("./telegram_reactions");

/** Polling must request message_reaction explicitly (Telegram default excludes it). */
const POLLING_ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "callback_query",
  "message_reaction",
  "message_reaction_count",
  "inline_query",
  "chosen_inline_result",
  "my_chat_member",
  "chat_member",
  "chat_join_request",
];

/** Hints when /status reports missing integrations (exact env key names for /set_key). */
function buildIntegrationSetupHints(missing) {
  const m = new Set((missing || []).map((x) => String(x).toLowerCase()));
  const lines = [];
  if (m.has("moltbook")) {
    lines.push(
      "• <b>Moltbook:</b> <code>/set_key PICLAW_MOLTBOOK_TOKEN</code> — send the token in your next message. Alias: <code>MOLTBOOK_API</code> → same token."
    );
  }
  if (m.has("smtp")) {
    lines.push(
      "• <b>SMTP:</b> set <code>PICLAW_SMTP_HOST</code>, <code>PICLAW_SMTP_USER</code>, <code>PICLAW_SMTP_PASS</code>, and optionally <code>PICLAW_SMTP_TEST_TO</code> / <code>PICLAW_SMTP_PORT</code> — one <code>/set_key</code> per line."
    );
  }
  return lines.length ? lines.join("\n") + "\n\n" : "";
}

/**
 * Telegram bot interface for Piclaw.
 * Standalone — no OpenClaw dependency.
 * Set PICLAW_TELEGRAM_TOKEN in env to enable.
 */

/** Avoid writing tokens/passwords to journald (Telegram logs are not secret). */
function logTelegramIncomingPreview(text) {
  const t = String(text || "");
  if (t.startsWith("/")) {
    console.log("[piclaw] Telegram received:", JSON.stringify(t.slice(0, 100)));
    return;
  }
  if (
    /github_pat_|ghp_[A-Za-z0-9_]+|gho_[A-Za-z0-9_]+|ghu_[A-Za-z0-9_]+|ghs_[A-Za-z0-9_]+|rghp_[A-Za-z0-9_]+/i.test(t) ||
    /nvapi-[A-Za-z0-9_-]+/i.test(t) ||
    /\bBearer\s+[A-Za-z0-9._-]+\b/i.test(t) ||
    /\b(ct0|auth_token)\s*[:=]\s*\S+/i.test(t)
  ) {
    console.log(
      "[piclaw] Telegram received: <redacted — message looks like a credential; use /set_key KEY then send the value, or set keys only in /opt/piclaw/.env>"
    );
    return;
  }
  const cap = 72;
  const tail = t.length > cap ? ` …(+${t.length - cap} chars)` : "";
  console.log("[piclaw] Telegram received:", JSON.stringify(t.slice(0, cap)) + tail);
}

/** Cached getMe() for group mention checks. */
let telegramBotSelfCache = null;

async function getTelegramBotSelf(bot) {
  if (telegramBotSelfCache) return telegramBotSelfCache;
  telegramBotSelfCache = await bot.getMe();
  return telegramBotSelfCache;
}

/**
 * PICLAW_TELEGRAM_GROUP_REPLY_MODE=all|mention
 * Default **mention** when unset: in groups only the @-mentioned bot (or reply-to-that-bot) runs chat — avoids every Pi answering the same line.
 * Set **all** if one bot in a group should see every message without @ (legacy).
 */
function getTelegramGroupReplyMode() {
  const raw = String(process.env.PICLAW_TELEGRAM_GROUP_REPLY_MODE || "").trim().toLowerCase();
  if (raw === "all") return "all";
  if (raw === "mention") return "mention";
  return "mention";
}

/**
 * For group/supergroup natural chat: require @username or reply to this bot when mode is mention.
 * Private channels always addressed. Commands use onText and skip this path.
 */
function isNaturalChatAddressedInGroup(msg, botUser) {
  const chatType = msg.chat && msg.chat.type;
  if (chatType !== "group" && chatType !== "supergroup") return true;
  if (getTelegramGroupReplyMode() !== "mention") return true;
  const myId = botUser && botUser.id;
  const un = ((botUser && botUser.username) || "").trim().toLowerCase();
  const rt = msg.reply_to_message;
  if (rt && rt.from && myId != null && rt.from.id === myId) return true;
  const full = msg.text || msg.caption || "";
  const lower = full.toLowerCase();
  if (un && lower.includes("@" + un)) return true;
  const ents = [...(msg.entities || []), ...(msg.caption_entities || [])];
  for (const e of ents) {
    if (e.type === "mention" && un) {
      const slice = full.substring(e.offset, e.offset + e.length).toLowerCase();
      if (slice === "@" + un) return true;
    }
    if (e.type === "text_mention" && e.user && myId != null && e.user.id === myId) return true;
  }
  return false;
}

/** When 1 (default), bot.sendMessage uses reply_to_message_id so replies appear threaded in Telegram. */
function isChatReplyThreadingEnabled() {
  const v = String(process.env.PICLAW_TELEGRAM_CHAT_REPLY_THREAD || "1")
    .trim()
    .toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

function formatQuotedNonTextHint(rt) {
  if (!rt || typeof rt !== "object") return "[message]";
  if (rt.photo) return "[photo, no caption in quote]";
  if (rt.video) return "[video]";
  if (rt.document) return "[document]";
  if (rt.sticker) return "[sticker]";
  if (rt.poll) return "[poll]";
  if (rt.voice) return "[voice]";
  if (rt.audio) return "[audio]";
  if (rt.location) return "[location]";
  return "[non-text message]";
}

function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function tailText(parts, maxChars = 3500) {
  const body = parts.filter(Boolean).join("\n").trim();
  if (!body) return "(no output)";
  return body.length > maxChars ? body.slice(-maxChars) : body;
}

function formatFailureHtml(parts, maxChars = 3500) {
  return `<b>Failed</b>\n<pre>${escapeHtml(tailText(parts, maxChars))}</pre>`;
}

function createMaintenanceGuard() {
  let active = null;
  return {
    enter(name) {
      if (active) {
        return { ok: false, active };
      }
      active = { name, startedAt: Date.now() };
      return { ok: true, active };
    },
    leave(name) {
      if (active && active.name === name) active = null;
    },
    status() {
      return active;
    },
  };
}

/**
 * Prefix the user turn so the model sees what Telegram message they replied to.
 * @param {object} msg - incoming Message
 * @param {object} botUser - getMe()
 * @returns {{ prefix: string | null, replyToId: number | null }}
 */
function buildTelegramReplyPrefix(msg, botUser) {
  const rt = msg.reply_to_message;
  if (!rt) return { prefix: null, replyToId: null };
  const chatId = msg.chat.id;
  let preview = (rt.text || rt.caption || "").trim();
  if (!preview) {
    const sn = snippets.get(chatId, rt.message_id);
    if (sn && sn.text) preview = sn.text;
  }
  if (!preview) preview = formatQuotedNonTextHint(rt);
  const clipped = preview.slice(0, 1200).replace(/\r?\n/g, " ").trim();
  const from = rt.from;
  const myId = botUser && botUser.id;
  const fromIsSelf = Boolean(from && from.is_bot && myId != null && from.id === myId);
  const fromLabel = fromIsSelf
    ? "this bot"
    : from && from.username
      ? `@${from.username}`
      : from && from.first_name
        ? String(from.first_name + (from.last_name ? ` ${from.last_name}` : ""))
        : from && from.id != null
          ? `user_id ${from.id}`
          : "unknown sender";
  const prefix =
    `[Telegram reply thread: this message replies to message #${rt.message_id} from ${fromLabel}.]\n` +
    `[Quoted message content:]\n${clipped}\n` +
    `[End quote — the user's NEW text (answer in context of the quote) is below:]\n`;
  return { prefix, replyToId: rt.message_id };
}

function createBot(getStatusText, options = {}) {
  const token = (process.env.PICLAW_TELEGRAM_TOKEN || "").trim();
  console.log("[piclaw] Telegram token length:", token.length);
  if (!token) {
    return null;
  }

  const bot = new TelegramBot(token, {
    polling: {
      params: {
        allowed_updates: POLLING_ALLOWED_UPDATES,
      },
    },
  });
  console.log("[piclaw] Telegram polling started (allowed_updates includes message_reaction)");
  console.log("[piclaw] Telegram group natural-chat mode:", getTelegramGroupReplyMode(), "(groups: mention = only @this_bot or reply-to-this-bot; set PICLAW_TELEGRAM_GROUP_REPLY_MODE=all for legacy)");
  const maintenance = createMaintenanceGuard();

  // User-friendly command menu (shown when user types / in Telegram)
  bot.setMyCommands([
    { command: "status", description: "System status" },
    { command: "whoami", description: "Identity & goals" },
    { command: "menu", description: "Quick actions" },
    { command: "help", description: "All commands" },
    { command: "new", description: "Reset chat session (owner)" },
    { command: "stop", description: "Pause chat replies (owner)" },
    { command: "setup", description: "Setup & env keys" },
    { command: "github", description: "GitHub auth" },
    { command: "twitter", description: "Twitter status" },
    { command: "hw", description: "Hardware (UART, GPIO)" },
    { command: "update", description: "A/B slot switch (needs piclaw-update)" },
    { command: "showupdates", description: "Commits behind upstream (owner)" },
    { command: "suggestgit", description: "Git status on clone (owner)" },
    { command: "updateandrestart", description: "Pull rsync npm restart (owner)" },
    { command: "usage", description: "Chat API usage ledger (owner)" },
    { command: "resources", description: "Host + token logs summary (owner)" },
    { command: "logs_summary", description: "Parse logs summary (owner)" },
    { command: "capabilities", description: "Runtime capabilities (owner)" },
    { command: "lan", description: "LAN summary (owner)" },
    { command: "devices", description: "Discovered devices (owner)" },
    { command: "router_status", description: "Router health (owner)" },
  ]).catch((err) => console.warn("[piclaw] setMyCommands failed:", err.message));

  bot.on("polling_error", (err) => {
    console.error("[piclaw] Telegram polling_error:", err.message);
  });

  bot.on("edited_message", (msg) => {
    try {
      const raw = (msg.text || msg.caption || "").trim();
      if (raw) {
        snippets.record(msg.chat.id, msg.message_id, raw, msg.from && msg.from.id);
      }
    } catch (_) {}
  });

  bot.on("message_reaction", (upd) => {
    try {
      if (typeof options.getReactionDeps !== "function") return;
      const deps = options.getReactionDeps();
      if (!deps || !deps.identityBridge) return;
      telegramReactions.handleMessageReaction(upd, {
        identityBridge: deps.identityBridge,
        appendExperience: deps.appendExperience,
        isOwnerUser: deps.isOwnerUser,
      });
    } catch (e) {
      console.warn("[piclaw] message_reaction:", (e && e.message) || e);
    }
  });

  bot.on("message", async (msg) => {
    try {
      const rawSnip = (msg.text || msg.caption || "").trim();
      if (rawSnip) {
        snippets.record(msg.chat.id, msg.message_id, rawSnip, msg.from && msg.from.id);
      }
    } catch (_) {}
    const text = (msg.text || msg.caption || "").trim();
    if (!text) return;
    const chatId = msg.chat.id;
    try {
      logTelegramIncomingPreview(text);
      if (!text.startsWith("/") && typeof options.getPendingEnvKey === "function" && typeof options.appendEnv === "function") {
        const key = options.getPendingEnvKey(chatId);
        if (key) {
          const result = await options.appendEnv(key, text);
          if (result && result.ok) {
            try {
              await bot.deleteMessage(chatId, msg.message_id);
            } catch (_) {}
            if (typeof options.clearPendingEnvKey === "function") options.clearPendingEnvKey(chatId);
            await bot.sendMessage(chatId, "Saved. Restart Piclaw to apply: sudo systemctl restart piclaw");
            if (typeof options.restartPiclaw === "function") {
              try {
                await options.restartPiclaw();
              } catch (_) {}
            }
          } else {
            await bot.sendMessage(chatId, "Failed: " + (result.reason || "unknown"));
          }
          return;
        }
      }
      if (text.startsWith("/")) return;
      if (typeof options.isSessionStopped === "function" && options.isSessionStopped(chatId)) {
        if (typeof options.isOwnerChat === "function" && !options.isOwnerChat(chatId, msg.from && msg.from.id)) {
          return;
        }
        await bot.sendMessage(chatId, "Session is paused. Send /new to resume with a fresh chat context.");
        return;
      }
      if (typeof options.isPendingCodexRedirect === "function" && options.isPendingCodexRedirect(chatId)) {
        const fromId = msg.from && msg.from.id;
        if (typeof options.isOwnerChat === "function" && !options.isOwnerChat(chatId, fromId)) return;
        if (typeof options.completeCodexLogin === "function" && options.completeCodexLogin(chatId, text)) {
          await bot.sendMessage(chatId, "Submitting redirect URL…");
          return;
        }
      }
      if (typeof options.onChatMessage === "function") {
        const botUser = await getTelegramBotSelf(bot);
        if (!isNaturalChatAddressedInGroup(msg, botUser)) {
          return;
        }
        console.log("[piclaw] Telegram: chat message, calling onChatMessage");
        try {
          const { prefix: replyPrefix } = buildTelegramReplyPrefix(msg, botUser);
          const userPayload = replyPrefix ? replyPrefix + text : text;
          const threadOpts = isChatReplyThreadingEnabled()
            ? { reply_to_message_id: msg.message_id }
            : {};
          await bot.sendChatAction(chatId, "typing").catch(() => {});
          const typingEveryMs = 4000;
          const typingTimer = setInterval(() => {
            bot.sendChatAction(chatId, "typing").catch(() => {});
          }, typingEveryMs);
          let reply;
          try {
            reply = await options.onChatMessage(userPayload, chatId);
          } finally {
            clearInterval(typingTimer);
          }
          const out = reply != null ? String(reply).trim() : "";
          if (out) {
            const sent = await bot.sendMessage(chatId, reply, threadOpts);
            try {
              if (sent && sent.message_id) {
                snippets.record(chatId, sent.message_id, out, null);
              }
            } catch (_) {}
            console.log("[piclaw] Telegram: sent chat reply (" + String(reply).length + " chars)");
          } else {
            console.log("[piclaw] Telegram: chat returned empty reply");
            await bot.sendMessage(
              chatId,
              "I did not get a non-empty reply to send. Try a shorter question or /status. If this repeats, check logs: journalctl -u piclaw -n 80",
              threadOpts
            );
          }
        } catch (err) {
          console.error("[piclaw] chat error:", err.message);
          const threadOpts = isChatReplyThreadingEnabled()
            ? { reply_to_message_id: msg.message_id }
            : {};
          await bot.sendMessage(chatId, `Error: ${err.message}`, threadOpts);
        }
      } else {
        console.log("[piclaw] Telegram: no onChatMessage handler");
      }
    } catch (_) {}
  });

  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    console.log("[piclaw] Telegram: /status from chat " + chatId);
    try {
      await bot.sendMessage(chatId, "One moment...");
      const text = await getStatusText();
      await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      console.error("[piclaw] Telegram /status error:", err.message);
      try { await bot.sendMessage(chatId, `Error: ${err.message}`); } catch (_) {}
    }
  });

  if (typeof options.getWhoamiText === "function") {
    bot.onText(/\/whoami/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const text = await options.getWhoamiText();
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.getReviewStatusText === "function") {
    bot.onText(/\/review_status/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const text = options.getReviewStatusText();
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.sendTestMail === "function") {
    bot.onText(/\/mailtest/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const result = await options.sendTestMail();
        const text = result.ok
          ? "SMTP OK — test message sent"
          : `SMTP FAILED — ${result.reason || "unknown"}`;
        await bot.sendMessage(chatId, text);
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.getGitHubStatus === "function") {
    bot.onText(/\/github/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const status = await options.getGitHubStatus();
        let text;
        if (!status.configured) {
          text =
            "GitHub: not configured — set <code>PICLAW_GITHUB_PAT</code> in <code>/opt/piclaw/.env</code> (optional <code>PICLAW_GITHUB_USERNAME</code> for labels). Use /setup or /set_key.";
        } else if (status.ok) {
          const login = status.login ? `@${status.login}` : "unknown";
          const rate = status.rate_limit_remaining != null ? ` · Rate limit: ${status.rate_limit_remaining} remaining` : "";
          text = `<b>GitHub Auth: OK</b>\nLogin: ${login}\nID: ${status.id ?? "n/a"}${status.name ? `\nName: ${status.name}` : ""}${rate}`;
        } else {
          text = `GitHub Auth: FAILED\nReason: ${status.reason || "unknown"}`;
        }
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.getTwitterStatus === "function") {
    bot.onText(/\/twitter/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const status = await options.getTwitterStatus();
        let text;
        if (status.ok) {
          const handle = status.screen_name ? `@${status.screen_name}` : "unknown";
          text = `<b>Twitter Auth: OK</b>\nUser: ${handle}\nFollowers: ${status.followers ?? 0}\nTimeline access: working`;
        } else {
          text = `Twitter Auth: FAILED (${status.reason || "unknown"})`;
        }
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.getSelfInspection === "function") {
    bot.onText(/\/selfcheck/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const inspection = await options.getSelfInspection();
        const intComplete = inspection.integrations_configured?.complete ? "complete" : "partial";
        const extList = (inspection.extensions_detected || []).length
          ? (inspection.extensions_detected || []).join(", ")
          : "none";
        const text = [
          "<b>Self Inspection</b>",
          `Runtime writable: ${inspection.writable_runtime ? "yes" : "no"}`,
          `Python available: ${inspection.python_available === true ? "yes" : inspection.python_available === false ? "no" : "unknown"}`,
          `Extensions: ${extList}`,
          `Integrations: ${intComplete}`,
          `Disk free: ${inspection.disk_free}`,
          `Version: ${inspection.version}`,
          `Slot: ${inspection.slot || "n/a"}`,
        ].join("\n");
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.getHardwareState === "function") {
    bot.onText(/\/hw/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const hw = options.getHardwareState();
        const uartStr = hw.uart.active
          ? `UART: active, last_seen ${hw.uart.last_seen || "—"}, ${hw.uart.bytes} bytes`
          : "UART: idle";
        const log = hw.gpio.gpio_log;
        const logLine =
          hw.gpio.monitored.length > 0 && log && log.enabled && log.path ? `State log: ${log.path}` : "";
        const gpioStr = hw.gpio.monitored.length > 0
          ? [
              `GPIO monitored: ${hw.gpio.monitored.join(", ")}`,
              logLine,
              "Last events:",
              (hw.gpio.last_events || []).slice(0, 10).map((e) => `  gpio${e.gpio} ${e.value} (${e.edge || "?"}) @ ${e.at}`).join("\n") || "  (none yet)",
            ]
              .filter(Boolean)
              .join("\n")
          : "GPIO: none";
        const text = ["<b>Hardware</b>", `Summary: ${hw.summary}`, "", uartStr, "", gpioStr].join("\n");
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.runUARTProbe === "function") {
    bot.onText(/\/probe_uart/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const result = await options.runUARTProbe();
        let text;
        if (result.ok) {
          const lines = [
            "<b>UART Probe Result</b>",
            `Device: ${result.device || "—"}`,
            `Best baud: ${result.baud ?? "—"}`,
            `Traffic: ${(result.traffic || "—").toUpperCase()}`,
            `Fingerprint: ${result.fingerprint || "—"}`,
            `Samples captured: ${result.samples ?? 0} bytes`,
          ];
          if (typeof options.identifyUartDevice === "function") {
            try {
              const identity = await options.identifyUartDevice(result);
              if (identity && identity.rejected === "registry_full") {
                lines.push("", "Registry full — new fingerprint not recorded.");
              } else if (identity && identity.device) {
                const d = identity.device;
                const pct = Math.round((d.confidence ?? 0) * 100);
                if (identity.confidenceHint) {
                  lines.push(
                    "",
                    "<b>Possible match (not recorded)</b>",
                    `id: ${d.id || "—"}`,
                    `seen: ${d.seen_count ?? 0} times`,
                    `confidence: ${pct}%`
                  );
                } else {
                  lines.push(
                    "",
                    "<b>UART Device Recognized</b>",
                    `id: ${d.id || "—"}`,
                    `seen: ${d.seen_count ?? 0} times`,
                    `confidence: ${pct}%`
                  );
                }
              }
            } catch (_) {}
          }
          text = lines.join("\n");
        } else {
          text = `UART probe: ${result.reason || "failed"}`;
        }
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.getUartDevicesText === "function") {
    bot.onText(/\/uart_devices/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const text = options.getUartDevicesText();
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.setUartLabel === "function") {
    bot.onText(/\/uart_label\s+(\S+)\s+(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const id = (match[1] || "").trim();
      const label = (match[2] || "").trim();
      try {
        if (!id) {
          await bot.sendMessage(chatId, "Usage: /uart_label &lt;id&gt; &lt;label&gt; — id from /uart_devices.");
          return;
        }
        const result = options.setUartLabel(id, label);
        if (result.ok) {
          await bot.sendMessage(chatId, `Label set: ${id} → "${label}".`);
        } else {
          await bot.sendMessage(chatId, `uart_label: ${result.reason || "failed"}.`);
        }
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  const gpio = options.gpioControl;
  if (gpio && typeof gpio.getControlConfig === "function") {
    bot.onText(/\/gpio(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const args = (match[1] || "").trim().split(/\s+/).filter(Boolean);
      try {
        if (args.length === 0) {
          const cfg = gpio.getControlConfig();
          const help = [
            "<b>GPIO control</b>",
            `Enabled: ${cfg.enabled ? "yes" : "no"}`,
            `Whitelist: ${(cfg.whitelist && cfg.whitelist.length) ? cfg.whitelist.join(", ") : "(none)"}`,
            `gpioset: ${cfg.gpiosetAvailable ? "available" : "missing"}`,
            "",
            "Commands:",
            "/gpio pulse &lt;pin&gt; &lt;ms&gt;  — pulse HIGH for ms (max " + cfg.maxMs + "), then release",
            "/gpio set &lt;pin&gt; HIGH|LOW &lt;sec&gt;  — hold for sec (max " + cfg.maxSec + "), then release",
          ].join("\n");
          await bot.sendMessage(chatId, help, { parse_mode: "HTML" });
          return;
        }
        if (args[0] === "pulse" && args.length >= 3) {
          const result = await gpio.pulsePin(args[1], args[2]);
          await bot.sendMessage(chatId, result.ok ? `Pulse ${args[1]} for ${args[2]}ms — done.` : `GPIO: ${result.reason || "failed"}`);
          return;
        }
        if (args[0] === "set" && args.length >= 4) {
          const result = await gpio.setPinFor(args[1], args[2], args[3]);
          await bot.sendMessage(chatId, result.ok ? `Pin ${args[1]} ${args[2]} for ${args[3]}s — done.` : `GPIO: ${result.reason || "failed"}`);
          return;
        }
        await bot.sendMessage(chatId, "Usage: /gpio — help. /gpio pulse &lt;pin&gt; &lt;ms&gt;. /gpio set &lt;pin&gt; HIGH|LOW &lt;sec&gt;.", { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.requestUpdate === "function") {
    // Anchor: unanchored /\/update/ matches "/updateandrestart" (prefix).
    bot.onText(/^\/update(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      const lock = maintenance.enter("update");
      if (!lock.ok) {
        const elapsed = Math.max(0, Math.round((Date.now() - lock.active.startedAt) / 1000));
        await bot.sendMessage(chatId, `Maintenance already running: /${lock.active.name} (${elapsed}s ago).`);
        return;
      }
      try {
        const result = await options.requestUpdate();
        if (result.ok) {
          const out = tailText([result.stdout, result.stderr]);
          await bot.sendMessage(chatId, `<b>Update requested</b>\n<pre>${escapeHtml(out)}</pre>`, { parse_mode: "HTML" });
        } else {
          const stderr = (result.stderr || "").toLowerCase();
          const abMissing = /not found|command not found|enoent/.test(stderr);
          const friendly = abMissing
            ? [
                "<b>/update</b> runs the <b>A/B</b> helper <code>piclaw-update</code> only.",
                "It is <b>not</b> installed on this Pi.",
                "",
                "For the usual flow (git pull → rsync → npm → restart), use <b>/updateandrestart</b> from the owner chat.",
                "A/B setup: <code>piclaw_runtime/docs/AB-UPDATE.md</code>.",
              ].join("\n")
            : tailText([result.stdout, result.stderr, result.error], 1200);
          await bot.sendMessage(chatId, abMissing ? `Update failed.\n${friendly}` : `Update failed. ${friendly}`, {
            parse_mode: abMissing ? "HTML" : undefined,
          });
        }
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      } finally {
        maintenance.leave("update");
      }
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.runGitShowUpdates === "function") {
    bot.onText(/\/showupdates/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) {
          await bot.sendMessage(chatId, "Only the owner chat can run /showupdates.");
          return;
        }
        await bot.sendMessage(chatId, "Fetching…");
        const r = await options.runGitShowUpdates();
        if (r.ok && r.text) await bot.sendMessage(chatId, r.text, { parse_mode: "HTML" });
        else await bot.sendMessage(chatId, `Error: ${r.error || "unknown"}`);
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.runGitSuggest === "function") {
    bot.onText(/\/suggestgit/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) {
          await bot.sendMessage(chatId, "Only the owner chat can run /suggestgit.");
          return;
        }
        const r = await options.runGitSuggest();
        if (r.ok && r.text) await bot.sendMessage(chatId, r.text, { parse_mode: "HTML" });
        else await bot.sendMessage(chatId, `Error: ${r.error || "unknown"}`);
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.getNetInfoHtml === "function") {
    bot.onText(/^\/net(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        if (typeof options.isOwnerChat === "function" && !options.isOwnerChat(chatId, msg.from && msg.from.id)) {
          await bot.sendMessage(chatId, "Only the owner chat can run /net.");
          return;
        }
        const text = await options.getNetInfoHtml();
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.runInstallTailscale === "function") {
    bot.onText(/^\/install_tailscale(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) {
          await bot.sendMessage(chatId, "Only the owner can run /install_tailscale.");
          return;
        }
        const lock = maintenance.enter("install_tailscale");
        if (!lock.ok) {
          const elapsed = Math.max(0, Math.round((Date.now() - lock.active.startedAt) / 1000));
          await bot.sendMessage(chatId, `Maintenance already running: /${lock.active.name} (${elapsed}s ago).`);
          return;
        }
        await bot.sendMessage(chatId, "Installing/joining Tailscale… (this may take 30–90s on a Pi 0)");
        const r = await options.runInstallTailscale();
        if (r.ok) {
          const s = r.status || {};
          const state = String(s.TAILSCALE_STATE || "unknown");
          const partial = String(r.healthy ? "" : " (partial)");
          const lines = [
            "<b>Tailscale</b>",
            `State:    <code>${escapeHtml(state)}</code>${escapeHtml(partial)}`,
            `Hostname: <code>${escapeHtml(s.TAILSCALE_HOSTNAME || "")}</code>`,
            `IPv4:     <code>${escapeHtml(s.TAILSCALE_IP4 || "n/a")}</code>`,
          ];
          if (s.TAILSCALE_IP4) {
            lines.push(`SSH:      <code>ssh ${escapeHtml(process.env.USER || "pi")}@${escapeHtml(s.TAILSCALE_IP4)}</code>`);
          }
          if (!r.healthy) lines.push("Health:   post-check not fully healthy yet; rerun /net in 10-20s.");
          if (r.redacted) lines.push("\nAuth key cleared from .env (single-use).");
          await bot.sendMessage(chatId, lines.join("\n"), { parse_mode: "HTML" });
        } else {
          await bot.sendMessage(chatId, formatFailureHtml([r.stdout, r.stderr, r.error]), { parse_mode: "HTML" });
        }
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      } finally {
        maintenance.leave("install_tailscale");
      }
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.runAgentRuntimeUpdate === "function") {
    bot.onText(/^\/updateandrestart(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) {
          const fromId = msg.from && msg.from.id;
          await bot.sendMessage(
            chatId,
            [
              "Only the owner can run /updateandrestart.",
              "",
              `This chat id: <code>${chatId}</code>`,
              fromId != null ? `Your Telegram user id: <code>${fromId}</code>` : "",
              "",
              "In <b>private</b> chat with the bot, set <code>PICLAW_TELEGRAM_CHAT_ID</code> to your user id.",
              "In a <b>group</b>, set <code>PICLAW_TELEGRAM_OWNER_USER_IDS</code> to your numeric user id (comma-separated if several), then restart piclaw.",
              "Or add the group chat id to <code>PICLAW_TELEGRAM_CHAT_ID</code> (comma-separated).",
            ]
              .filter(Boolean)
              .join("\n"),
            { parse_mode: "HTML" }
          );
          return;
        }
        const lock = maintenance.enter("updateandrestart");
        if (!lock.ok) {
          const elapsed = Math.max(0, Math.round((Date.now() - lock.active.startedAt) / 1000));
          await bot.sendMessage(chatId, `Maintenance already running: /${lock.active.name} (${elapsed}s ago).`);
          return;
        }
        await bot.sendMessage(chatId, "Running update script (git pull, rsync, npm, restart). This may take a few minutes…");
        const r = await options.runAgentRuntimeUpdate();
        if (r.ok) {
          await bot.sendMessage(chatId, `<b>Done</b>\n<pre>${escapeHtml(tailText([r.stdout, r.stderr]))}</pre>`, {
            parse_mode: "HTML",
          });
        } else {
          await bot.sendMessage(chatId, formatFailureHtml([r.stdout, r.stderr, r.error]), { parse_mode: "HTML" });
        }
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      } finally {
        maintenance.leave("updateandrestart");
      }
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.getUsageReportHtml === "function") {
    bot.onText(/\/usage/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) {
          await bot.sendMessage(chatId, "Only the owner chat can run /usage.");
          return;
        }
        const text = options.getUsageReportHtml();
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.getResourcesReportHtml === "function") {
    bot.onText(/\/resources/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) {
          await bot.sendMessage(chatId, "Only the owner chat can run /resources.");
          return;
        }
        const text = options.getResourcesReportHtml();
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.getLogsSummaryHtml === "function") {
    bot.onText(/\/logs_summary/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) {
          await bot.sendMessage(chatId, "Only the owner chat can run /logs_summary.");
          return;
        }
        const text = options.getLogsSummaryHtml();
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.setPendingEnvKey === "function" && typeof options.appendEnv === "function") {
    bot.onText(/\/set_key\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const rawKey = (match[1] || "").trim();
      const key = normalizeSetKeyName(rawKey);
      try {
        if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) {
          await bot.sendMessage(chatId, "Only the owner chat can set env keys.");
          return;
        }
        if (typeof options.isAllowedKey === "function" && !options.isAllowedKey(key)) {
          await bot.sendMessage(
            chatId,
            [
              "Key not allowed. Names must be uppercase <code>PICLAW_*</code> or <code>OPENAI_*</code> (see <code>/setup</code>).",
              "",
              "Moltbook token: <code>/set_key PICLAW_MOLTBOOK_TOKEN</code> (alias: <code>MOLTBOOK_API</code>)",
              "GitHub PAT: <code>/set_key PICLAW_GITHUB_PAT</code> (alias: <code>GITHUB_TOKEN</code>)",
            ].join("\n"),
            { parse_mode: "HTML" }
          );
          return;
        }
        options.setPendingEnvKey(chatId, key);
        const aliasNote =
          key && key !== rawKey.trim().toUpperCase()
            ? `\n(Saving as <code>${key}</code> — normalized from <code>${rawKey}</code>.)`
            : "";
        await bot.sendMessage(
          chatId,
          "Send the value in your next message. I'll add it and delete your message." + aliasNote,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
    bot.onText(/\/setup/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        let text = "<b>Setup</b>\n\n";
        if (typeof options.getMissingIntegrations === "function") {
          const missing = options.getMissingIntegrations();
          if (missing && missing.length > 0) {
            text += "Missing: " + missing.join(", ") + "\n\n";
            text += buildIntegrationSetupHints(missing);
          }
        }
        if (typeof options.isIdentityAvailable === "function" && !options.isIdentityAvailable()) {
          text += "Identity not configured. Create /opt/piclaw_identity (see DEPLOY.md) or run on the Pi: <code>node scripts/bootstrap-identity.js</code>\n\n";
        }
        text +=
          "<b>Piclaw chat tool limit:</b> <code>PICLAW_CHAT_MAX_TOOL_ROUNDS</code> (default 16, max 32) = max back-and-forth steps when you send a normal message (model may call <code>exec</code>, <code>read_file</code>, etc. each round). Raise it if you see “agent loop limit reached”.\n\n";
        text += "To set a key: /set_key KEY_NAME then send the value in your next message (I'll delete it).\n\n";
        if (typeof options.getAllowedKeys === "function") {
          const keys = options.getAllowedKeys();
          if (keys && keys.length) {
            text += "Allowed keys (same list as <code>piclaw_runtime/.env.example</code>):\n<pre>" + keys.join("\n") + "</pre>";
          }
        }
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.resetChatSession === "function") {
    bot.onText(/^\/new(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) {
          await bot.sendMessage(chatId, "Only the owner can run /new.");
          return;
        }
        options.resetChatSession(chatId);
        if (typeof options.clearPendingEnvKey === "function") options.clearPendingEnvKey(chatId);
        await bot.sendMessage(chatId, "Started a new session. Previous chat memory for this chat was cleared.");
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.stopChatSession === "function") {
    bot.onText(/^\/stop(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) {
          await bot.sendMessage(chatId, "Only the owner can run /stop.");
          return;
        }
        options.stopChatSession(chatId);
        await bot.sendMessage(chatId, "Session paused for this chat. Send /new to clear context and resume.");
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.getCapabilitiesHtml === "function") {
    bot.onText(/^\/capabilities(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /capabilities.");
      const text = await options.getCapabilitiesHtml();
      await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.getLanSummaryHtml === "function") {
    bot.onText(/^\/lan(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /lan.");
      if (typeof options.runLanScan === "function") await options.runLanScan();
      await bot.sendMessage(chatId, options.getLanSummaryHtml(), { parse_mode: "HTML" });
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.getLanDeviceHtml === "function") {
    bot.onText(/^\/lan_show(?:@\S+)?\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /lan_show.");
      await bot.sendMessage(chatId, options.getLanDeviceHtml((match && match[1]) || ""), { parse_mode: "HTML" });
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.setLanDeviceName === "function") {
    bot.onText(/^\/lan_name(?:@\S+)?\s+(\S+)\s+(.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /lan_name.");
      const r = options.setLanDeviceName(match[1], match[2]);
      await bot.sendMessage(chatId, r.ok ? "Saved." : `Failed: ${r.reason || "unknown"}`);
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.addLanDeviceTag === "function") {
    bot.onText(/^\/lan_tag(?:@\S+)?\s+(\S+)\s+(.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /lan_tag.");
      const r = options.addLanDeviceTag(match[1], match[2]);
      await bot.sendMessage(chatId, r.ok ? "Saved." : `Failed: ${r.reason || "unknown"}`);
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.setLanDeviceWatch === "function") {
    bot.onText(/^\/lan_watch(?:@\S+)?\s+(\S+)(?:\s+(on|off))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /lan_watch.");
      const enabled = String(match[2] || "on").toLowerCase() !== "off";
      const r = options.setLanDeviceWatch(match[1], enabled);
      await bot.sendMessage(chatId, r.ok ? `watch=${enabled ? "on" : "off"}` : `Failed: ${r.reason || "unknown"}`);
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.runDeviceDiscovery === "function") {
    bot.onText(/^\/devices(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /devices.");
      await options.runDeviceDiscovery();
      const text = typeof options.getDevicesHtml === "function" ? options.getDevicesHtml() : "ok";
      await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.getDeviceHtml === "function") {
    bot.onText(/^\/device_show(?:@\S+)?\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /device_show.");
      await bot.sendMessage(chatId, options.getDeviceHtml(match[1]), { parse_mode: "HTML" });
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.cameraStream === "function") {
    bot.onText(/^\/cam_stream(?:@\S+)?\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /cam_stream.");
      const r = await options.cameraStream(match[1]);
      await bot.sendMessage(chatId, `<pre>${escapeHtml(JSON.stringify(r, null, 2))}</pre>`, { parse_mode: "HTML" });
    });
    bot.onText(/^\/speaker_play(?:@\S+)?\s+(\S+)\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /speaker_play.");
      const r = await options.speakerPlay(match[1], match[2]);
      await bot.sendMessage(chatId, `<pre>${escapeHtml(JSON.stringify(r, null, 2))}</pre>`, { parse_mode: "HTML" });
    });
    bot.onText(/^\/tv_off(?:@\S+)?\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /tv_off.");
      const r = await options.tvOff(match[1]);
      await bot.sendMessage(chatId, `<pre>${escapeHtml(JSON.stringify(r, null, 2))}</pre>`, { parse_mode: "HTML" });
    });
    bot.onText(/^\/desktop_run(?:@\S+)?\s+(\S+)\s+(.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /desktop_run.");
      const r = await options.desktopRun(match[1], match[2]);
      await bot.sendMessage(chatId, `<pre>${escapeHtml(JSON.stringify(r, null, 2))}</pre>`, { parse_mode: "HTML" });
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.getRouterStatusHtml === "function") {
    bot.onText(/^\/router_status(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /router_status.");
      await bot.sendMessage(chatId, await options.getRouterStatusHtml(), { parse_mode: "HTML" });
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.getRouterDevicesHtml === "function") {
    bot.onText(/^\/router_devices(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /router_devices.");
      await bot.sendMessage(chatId, await options.getRouterDevicesHtml(), { parse_mode: "HTML" });
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.setRouterWifi === "function") {
    bot.onText(/^\/wifi_(on|off)(?:@\S+)?(?:\s+(\S+))?$/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /wifi_on or /wifi_off.");
      const on = match[1] === "on";
      const band = match[2] || "all";
      const r = await options.setRouterWifi(on, band);
      await bot.sendMessage(chatId, r.ok ? "Requested." : `Failed: ${r.reason || "unknown"}`);
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.suspendRouterDevice === "function") {
    bot.onText(/^\/suspend(?:@\S+)?\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /suspend.");
      const r = await options.suspendRouterDevice(match[1]);
      await bot.sendMessage(chatId, r.ok ? "Requested." : `Failed: ${r.reason || "unknown"}`);
    });
    bot.onText(/^\/unsuspend(?:@\S+)?\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /unsuspend.");
      const r = await options.unsuspendRouterDevice(match[1]);
      await bot.sendMessage(chatId, r.ok ? "Requested." : `Failed: ${r.reason || "unknown"}`);
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.setRadioMode === "function") {
    bot.onText(/^\/(ap_on|ap_off|monitor_on|monitor_off)(?:@\S+)?$/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run radio mode commands.");
      const map = { ap_on: "ap", ap_off: "idle", monitor_on: "monitor", monitor_off: "idle" };
      const r = await options.setRadioMode(map[match[1]]);
      await bot.sendMessage(chatId, r.ok ? `Radio mode: ${r.mode}` : `Failed: ${r.reason || "unknown"}`);
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.getHandshakeStatusHtml === "function") {
    bot.onText(/^\/handshake_status(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /handshake_status.");
      await bot.sendMessage(chatId, options.getHandshakeStatusHtml(), { parse_mode: "HTML" });
    });
    bot.onText(/^\/handshake_list(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /handshake_list.");
      await bot.sendMessage(chatId, options.getHandshakeStatusHtml(), { parse_mode: "HTML" });
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.captureHandshakeOnce === "function") {
    bot.onText(/^\/handshake_capture(?:@\S+)?(?:\s+(\d+))?$/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /handshake_capture.");
      const sec = match && match[1] ? parseInt(match[1], 10) : 20;
      const r = await options.captureHandshakeOnce(sec);
      await bot.sendMessage(chatId, r.ok ? `Saved: ${r.file}` : `Failed: ${r.reason || r.stderr || "unknown"}`);
    });
  }
  if (typeof options.isOwnerChat === "function" && typeof options.createSegment === "function") {
    bot.onText(/^\/segment_create(?:@\S+)?\s+(\S+)\s+(\S+)\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /segment_create.");
      const p = options.createSegment(match[1], match[2], match[3]);
      await bot.sendMessage(chatId, `<pre>${escapeHtml(JSON.stringify(p, null, 2))}</pre>`, { parse_mode: "HTML" });
    });
    bot.onText(/^\/segment_list(?:@\S+)?$/, async (msg) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /segment_list.");
      const p = options.listSegments();
      await bot.sendMessage(chatId, `<pre>${escapeHtml(JSON.stringify(p, null, 2))}</pre>`, { parse_mode: "HTML" });
    });
    bot.onText(/^\/segment_join(?:@\S+)?\s+(\S+)\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!options.isOwnerChat(chatId, msg.from && msg.from.id)) return bot.sendMessage(chatId, "Only the owner can run /segment_join.");
      const p = options.joinSegment(match[1], match[2]);
      await bot.sendMessage(chatId, `<pre>${escapeHtml(JSON.stringify(p, null, 2))}</pre>`, { parse_mode: "HTML" });
    });
  }

  if (typeof options.startCodexLogin === "function") {
    bot.onText(/\/codex_login/, async (msg) => {
      const chatId = msg.chat.id;
      if (typeof options.isOwnerChat === "function" && !options.isOwnerChat(chatId, msg.from && msg.from.id)) {
        await bot.sendMessage(chatId, "Only the owner can start Codex login.");
        return;
      }
      try {
        await options.startCodexLogin(chatId, {
          sendMessage: (t) => bot.sendMessage(chatId, t),
          onComplete: (err, result) => {
            const msg2 = err ? "Codex auth failed: " + err.message : "Codex authorized.";
            bot.sendMessage(chatId, msg2).catch(() => {});
          },
        });
      } catch (err) {
        await bot.sendMessage(chatId, "Error: " + err.message);
      }
    });
  }
  if (typeof options.getExperimentsText === "function") {
    bot.onText(/\/experiments/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const text = await options.getExperimentsText();
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }
  if (typeof options.runExperiment === "function") {
    bot.onText(/\/run_experiment\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const id = (match && match[1] || "").trim();
      if (!id) {
        await bot.sendMessage(chatId, "Usage: /run_experiment <id>");
        return;
      }
      try {
        const result = await options.runExperiment(id);
        const text = result.ok
          ? (result.message || "Done.")
          : `Failed: ${result.reason || result.message || "unknown"}`;
        await bot.sendMessage(chatId, text);
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await bot.sendMessage(chatId, "Choose an action:", {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📊 Status", callback_data: "menu:status" },
              { text: "👤 Who am I", callback_data: "menu:whoami" },
            ],
            [
              { text: "⚙️ Setup", callback_data: "menu:setup" },
              { text: "❓ Help", callback_data: "menu:help" },
            ],
            [{ text: "💬 Just chat — send a message below", callback_data: "menu:chat" }],
          ],
        },
      });
    } catch (err) {
      try { await bot.sendMessage(chatId, `Error: ${err.message}`); } catch (_) {}
    }
  });

  bot.on("callback_query", async (query) => {
    const data = (query.data || "").trim();
    const chatId = query.message?.chat?.id;
    const msgId = query.message?.message_id;
    if (!data.startsWith("menu:") || !chatId) return;
    try {
      await bot.answerCallbackQuery(query.id);
      const action = data.slice(5);
      if (action === "status") {
        const text = await getStatusText();
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } else if (action === "whoami" && typeof options.getWhoamiText === "function") {
        const text = await options.getWhoamiText();
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } else if (action === "setup") {
        let text = "<b>Setup</b>\n\n";
        if (typeof options.getMissingIntegrations === "function") {
          const missing = options.getMissingIntegrations();
          if (missing && missing.length > 0) {
            text += "Missing: " + missing.join(", ") + "\n\n";
            text += buildIntegrationSetupHints(missing);
          }
        }
        if (typeof options.isIdentityAvailable === "function" && !options.isIdentityAvailable()) {
          text += "Identity: not configured. Run on the Pi: <code>node scripts/bootstrap-identity.js</code>\n\n";
        }
        text +=
          "<code>PICLAW_CHAT_MAX_TOOL_ROUNDS</code> = max tool rounds per chat message (default 16).\n\nUse <code>/set_key KEY</code> then send the value. Full key list: send <code>/setup</code> as a message (not this button).";
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } else if (action === "help") {
        const helpLines = [
          "<b>Commands</b>",
          "/status — system status",
          "/whoami — identity, mission, goals",
          "/menu — quick actions (this)",
          "/setup — env keys & missing integrations",
          "/github, /twitter — auth status",
          "/hw, /gpio — hardware",
          "/update — A/B slot switch only (needs piclaw-update)",
          "/showupdates, /suggestgit, /updateandrestart, /usage, /resources, /logs_summary — owner only",
          "/help — full command list",
          "",
          "Send any message to chat with me.",
          "Reply to any message to give me thread context; I reply threaded by default.",
          "Reactions on messages (❤🔥👍👎👏) are recorded when enabled — see /help.",
        ];
        await bot.sendMessage(chatId, helpLines.join("\n"), { parse_mode: "HTML" });
      } else if (action === "chat") {
        await bot.sendMessage(chatId, "Send me a message and I'll reply using my identity and memory.");
      }
    } catch (err) {
      try { await bot.sendMessage(chatId, `Error: ${err.message}`); } catch (_) {}
    }
  });

  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const helpLines = [
      "<b>Commands</b>",
      "/status — system status",
      "/whoami — identity, mission, goals",
      "/menu — quick actions (buttons)",
      "/new — clear this chat session memory and resume (owner)",
      "/stop — pause chat replies for this chat (owner; resume with /new)",
      "/review_status — last goal review",
      "/selfcheck — runtime slot, version",
      "/hw — hardware (UART, GPIO)",
      "/github — GitHub auth",
      "/twitter — Twitter status",
      "/mailtest — test SMTP",
      "/probe_uart — run UART probe",
      "/uart_devices — list UART devices",
      "/gpio — GPIO control (pulse/set)",
      "/update — A/B slot switch only (needs piclaw-update; see docs/AB-UPDATE.md)",
      "/net — local/public IP, Tailscale state, ssh ready hint (owner)",
      "/capabilities — runtime capability matrix (owner)",
      "/lan — LAN summary + fresh scan (owner)",
      "/lan_show <ip|mac> — show one tracked device (owner)",
      "/lan_name <ip|mac> <name> — assign human name (owner)",
      "/lan_tag <ip|mac> <tag> — assign metadata tag (owner)",
      "/lan_watch <ip|mac> [on|off] — watchlist toggle (owner)",
      "/devices — refresh protocol discovery + list (owner)",
      "/device_show <id> — details for one device (owner)",
      "/cam_stream <id> — camera stream metadata (owner)",
      "/speaker_play <id> <url> — play media on speaker/tv adapter (owner)",
      "/tv_off <id> — power command scaffold (owner)",
      "/desktop_run <id> <cmd> — ssh command scaffold (owner)",
      "/router_status — FRITZ/TR-064 status (owner)",
      "/router_devices — FRITZ host list / placeholder (owner)",
      "/wifi_on [band] | /wifi_off [band] — router WLAN control (owner)",
      "/suspend <mac> | /unsuspend <mac> — router host control (owner)",
      "/ap_on | /ap_off — set wlan1 AP/idle mode (owner)",
      "/monitor_on | /monitor_off — set wlan1 monitor/idle mode (owner)",
      "/handshake_status | /handshake_list | /handshake_capture [sec] (owner)",
      "/segment_create <name> <vlan> <subnet> | /segment_list | /segment_join <name> <agent> (owner)",
      "/install_tailscale — install + join Tailscale using PICLAW_TAILSCALE_AUTHKEY (owner)",
      "/showupdates — commits on upstream not merged into current clone HEAD (owner)",
      "/suggestgit — git status + diff stat in PICLAW_GIT_CLONE_ROOT (owner)",
      "/updateandrestart — pull, rsync piclaw_runtime to /opt/piclaw, npm, restart service (owner)",
      "/usage — recent chat completion token rows from identity ledger (owner)",
      "/resources — host metrics paths, last sample, token summary (owner)",
      "/logs_summary — bounded parse of host-health + ledger + log hints (owner)",
      "/setup — list missing integrations, set env keys",
      "/experiments — list builder-researcher experiments (queue)",
      "/run_experiment &lt;id&gt; — run one experiment by id",
      "/codex_login — start Codex OAuth; open URL, then paste redirect URL here",
      "/set_key KEY — then send value (I delete the message)",
      "/help — this message",
      "",
      "Send normal text to chat with me (identity + memory).",
      "",
      "<b>Reply threading</b>: reply to a specific message so I see quoted context in the model; my replies use Telegram reply threading by default (<code>PICLAW_TELEGRAM_CHAT_REPLY_THREAD</code>).",
      "",
      "<b>Reactions</b> (when enabled): ❤ good idea → memory · 🔥 long-term memory · 👍 good feedback · 👎 avoid / bad feedback · 👏 approved to act. Bot may need admin in groups to receive reaction updates.",
    ];
    await bot.sendMessage(chatId, helpLines.join("\n"), { parse_mode: "HTML" });
  });

  return bot;
}

module.exports = { createBot };
