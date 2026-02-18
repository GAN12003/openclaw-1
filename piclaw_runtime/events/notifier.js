"use strict";

let bot = null;
let chatId = null;

function setNotifyTarget(telegramBot, telegramChatId) {
  bot = telegramBot;
  chatId = telegramChatId && String(telegramChatId).trim() ? String(telegramChatId).trim() : null;
}

function notify(message) {
  try {
    if (bot && chatId) {
      bot.sendMessage(chatId, message).catch(() => {});
    } else {
      console.log("[piclaw] event:", message);
    }
  } catch (_) {}
}

module.exports = { setNotifyTarget, notify };
