"use strict";

const TelegramBot = require("node-telegram-bot-api");

/**
 * Telegram bot interface for Piclaw.
 * Standalone — no OpenClaw dependency.
 * Set PICLAW_TELEGRAM_TOKEN in env to enable.
 */

function createBot(getStatusText, options = {}) {
  const token = (process.env.PICLAW_TELEGRAM_TOKEN || "").trim();
  console.log("[piclaw] Telegram token length:", token.length);
  if (!token) {
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });
  console.log("[piclaw] Telegram polling started");

  // User-friendly command menu (shown when user types / in Telegram)
  bot.setMyCommands([
    { command: "status", description: "System status" },
    { command: "whoami", description: "Identity & goals" },
    { command: "menu", description: "Quick actions" },
    { command: "help", description: "All commands" },
    { command: "setup", description: "Setup & env keys" },
    { command: "github", description: "GitHub auth" },
    { command: "twitter", description: "Twitter status" },
    { command: "hw", description: "Hardware (UART, GPIO)" },
    { command: "update", description: "Apply update" },
  ]).catch((err) => console.warn("[piclaw] setMyCommands failed:", err.message));

  bot.on("polling_error", (err) => {
    console.error("[piclaw] Telegram polling_error:", err.message);
  });

  bot.on("message", async (msg) => {
    const text = (msg.text || "").trim();
    if (!text) return;
    const chatId = msg.chat.id;
    try {
      console.log("[piclaw] Telegram received:", JSON.stringify(text.slice(0, 80)));
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
      if (typeof options.isPendingCodexRedirect === "function" && options.isPendingCodexRedirect(chatId)) {
        if (typeof options.isOwnerChat === "function" && !options.isOwnerChat(chatId)) return;
        if (typeof options.completeCodexLogin === "function" && options.completeCodexLogin(chatId, text)) {
          await bot.sendMessage(chatId, "Submitting redirect URL…");
          return;
        }
      }
      if (typeof options.onChatMessage === "function") {
        console.log("[piclaw] Telegram: chat message, calling onChatMessage");
        try {
          const reply = await options.onChatMessage(text, chatId);
          if (reply) {
            await bot.sendMessage(chatId, reply);
            console.log("[piclaw] Telegram: sent chat reply (" + String(reply).length + " chars)");
          } else {
            console.log("[piclaw] Telegram: chat returned empty reply");
          }
        } catch (err) {
          console.error("[piclaw] chat error:", err.message);
          await bot.sendMessage(chatId, `Error: ${err.message}`);
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
          text = "GitHub: not configured (PICLAW_GITHUB_PAT missing)";
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
        const gpioStr = hw.gpio.monitored.length > 0
          ? `GPIO monitored: ${hw.gpio.monitored.join(", ")}\nLast events:\n${(hw.gpio.last_events || []).slice(0, 10).map((e) => `  gpio${e.gpio} ${e.value} @ ${e.at}`).join("\n") || "  (none yet)"}`
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
    bot.onText(/\/update/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const result = await options.requestUpdate();
        if (result.ok) {
          await bot.sendMessage(chatId, "Update requested — switching slot on next restart.");
        } else {
          const stderr = (result.stderr || "").toLowerCase();
          const friendly = /not found|command not found|enoent/.test(stderr)
            ? "A/B update not set up. Install piclaw-update and slots (see docs/AB-UPDATE.md)."
            : `${result.stderr || result.stdout || "unknown"}`.trim().slice(0, 400);
          await bot.sendMessage(chatId, `Update failed. ${friendly}`);
        }
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.isOwnerChat === "function" && typeof options.setPendingEnvKey === "function" && typeof options.appendEnv === "function") {
    bot.onText(/\/set_key\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const key = (match[1] || "").trim();
      try {
        if (!options.isOwnerChat(chatId)) {
          await bot.sendMessage(chatId, "Only the owner chat can set env keys.");
          return;
        }
        if (typeof options.isAllowedKey === "function" && !options.isAllowedKey(key)) {
          await bot.sendMessage(chatId, "Key not allowed. Use /setup to see allowed keys.");
          return;
        }
        options.setPendingEnvKey(chatId, key);
        await bot.sendMessage(chatId, "Send the value in your next message. I'll add it and delete your message.");
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
          }
        }
        if (typeof options.isIdentityAvailable === "function" && !options.isIdentityAvailable()) {
          text += "Identity not configured. Create /opt/piclaw_identity (see DEPLOY.md) or run on the Pi: <code>node scripts/bootstrap-identity.js</code>\n\n";
        }
        text += "To set a key: /set_key KEY_NAME then send the value in your next message (I'll delete it).\n\n";
        if (typeof options.getAllowedKeys === "function") {
          const keys = options.getAllowedKeys();
          if (keys && keys.length) text += "Allowed keys: " + keys.slice(0, 15).join(", ") + (keys.length > 15 ? "…" : "");
        }
        await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  if (typeof options.startCodexLogin === "function") {
    bot.onText(/\/codex_login/, async (msg) => {
      const chatId = msg.chat.id;
      if (typeof options.isOwnerChat === "function" && !options.isOwnerChat(chatId)) {
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
          if (missing && missing.length > 0) text += "Missing: " + missing.join(", ") + "\n\n";
        }
        if (typeof options.isIdentityAvailable === "function" && !options.isIdentityAvailable()) {
          text += "Identity: not configured. Run on the Pi: <code>node scripts/bootstrap-identity.js</code>\n\n";
        }
        text += "Use /set_key KEY_NAME then send the value in your next message. /help for full list.";
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
          "/update — apply update",
          "/help — full command list",
          "",
          "Send any message to chat with me.",
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
      "/review_status — last goal review",
      "/selfcheck — runtime slot, version",
      "/hw — hardware (UART, GPIO)",
      "/github — GitHub auth",
      "/twitter — Twitter status",
      "/mailtest — test SMTP",
      "/probe_uart — run UART probe",
      "/uart_devices — list UART devices",
      "/gpio — GPIO control (pulse/set)",
      "/update — apply update (needs A/B setup)",
      "/setup — list missing integrations, set env keys",
      "/experiments — list builder-researcher experiments (queue)",
      "/run_experiment &lt;id&gt; — run one experiment by id",
      "/codex_login — start Codex OAuth; open URL, then paste redirect URL here",
      "/set_key KEY — then send value (I delete the message)",
      "/help — this message",
      "",
      "Send normal text to chat with me (identity + memory).",
    ];
    await bot.sendMessage(chatId, helpLines.join("\n"), { parse_mode: "HTML" });
  });

  bot.on("polling_error", (err) => {
    console.error("[piclaw] Telegram polling error:", err.message);
  });

  return bot;
}

module.exports = { createBot };
