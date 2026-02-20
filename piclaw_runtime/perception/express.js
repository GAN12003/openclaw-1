"use strict";

/**
 * Expression: where Piclaw "speaks". Experience log always; optional Telegram notify; optional I2C LCD.
 * Never triggers GPIO / install / network. Only memory and optional owner notification.
 */

const identityBridge = require("../identity_bridge");
const lcd = require("./lcd");

let notifyFn = null;
let notifyCooldownMs = 2 * 60 * 1000;
let lastNotifyAt = 0;

function configure(opts) {
  if (opts && typeof opts.notify === "function") notifyFn = opts.notify;
  if (opts && typeof opts.notifyCooldownMs === "number") notifyCooldownMs = opts.notifyCooldownMs;
}

function say(text, options) {
  if (!text || typeof text !== "string") return;
  const line = text.trim();
  if (!line) return;
  identityBridge.appendExperience(line);
  const shouldNotify = options && options.notify === true && notifyFn;
  if (shouldNotify && Date.now() - lastNotifyAt >= notifyCooldownMs) {
    try {
      notifyFn(line);
      lastNotifyAt = Date.now();
    } catch (_) {}
  }
  if (lcd.isEnabled()) {
    try {
      lcd.pushLine(line);
    } catch (_) {}
  }
}

module.exports = { say, configure };
