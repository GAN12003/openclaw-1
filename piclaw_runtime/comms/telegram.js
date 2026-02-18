"use strict";

const TelegramBot = require("node-telegram-bot-api");

/**
 * Telegram bot interface for Piclaw.
 * Standalone — no OpenClaw dependency.
 * Set PICLAW_TELEGRAM_TOKEN in env to enable.
 */

function createBot(getStatusText, options = {}) {
  const token = process.env.PICLAW_TELEGRAM_TOKEN;
  if (!token || !token.trim()) {
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });

  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const text = await getStatusText();
      await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      await bot.sendMessage(chatId, `Error: ${err.message}`);
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
          await bot.sendMessage(chatId, `Update failed (code ${result.code}). ${result.stderr || result.stdout || ""}`.trim().slice(0, 400));
        }
      } catch (err) {
        await bot.sendMessage(chatId, `Error: ${err.message}`);
      }
    });
  }

  bot.on("polling_error", (err) => {
    console.error("[piclaw] Telegram polling error:", err.message);
  });

  return bot;
}

module.exports = { createBot };
