"use strict";

const eventRouter = require("./event_router");

let bot = null;
let chatId = null;

function setNotifyTarget(telegramBot, telegramChatId) {
  bot = telegramBot;
  chatId = telegramChatId && String(telegramChatId).trim() ? String(telegramChatId).trim() : null;
}

function notify(message) {
  try {
    eventRouter.emit({
      topic: "notify.owner",
      summary: String(message || ""),
      details: { channel: "telegram" },
      dedupe_key: String(message || "").slice(0, 128),
    });
    if (bot && chatId) {
      bot.sendMessage(chatId, message).catch(() => {});
    } else {
      console.log("[piclaw] event:", message);
    }
  } catch (_) {}
}

module.exports = { setNotifyTarget, notify };
