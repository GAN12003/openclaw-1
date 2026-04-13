"use strict";

/**
 * Perception: turn raw signals into sensory events, then interpret and express.
 * Does not change decisions. Only gives meaning and voice to what already happens.
 * Never triggers GPIO / install / network — only interpret → express.
 */

const interpret = require("./interpret");
const express = require("./express");

function wakeNotifyTelegramEnabled() {
  const v = String(process.env.PICLAW_NOTIFY_WAKE_TELEGRAM || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function emit(type, payload) {
  if (!type || typeof type !== "string") return;
  const event = {
    type,
    payload: payload != null && typeof payload === "object" ? payload : {},
    at: new Date().toISOString(),
  };
  const narrative = interpret.interpret(event);
  if (narrative) {
    const opts = type === "wake" && wakeNotifyTelegramEnabled() ? { notify: true } : {};
    express.say(narrative, opts);
  }
}

module.exports = { emit };
