"use strict";

const rules = require("./rules");
const state = require("./state");
const notifier = require("./notifier");

function handleGPIOEvent(ev) {
  const r = rules.getRules();
  const pinRule = r.gpio[String(ev.gpio)];
  if (!pinRule || !pinRule.notify) return;
  const onEdge = (pinRule.on || "rising").toLowerCase();
  const wantRising = onEdge === "rising";
  const wantFalling = onEdge === "falling";
  const isRising = ev.value === "HIGH";
  const isFalling = ev.value === "LOW";
  const match = (wantRising && isRising) || (wantFalling && isFalling);
  if (!match) return;
  const ruleId = `gpio.${ev.gpio}`;
  const cooldownSec = typeof pinRule.cooldown_sec === "number" ? pinRule.cooldown_sec : 30;
  if (!state.shouldFire(ruleId, cooldownSec)) return;
  notifier.notify(pinRule.notify);
  state.recordFire(ruleId);
}

function handleUARTActivity(info) {
  const r = rules.getRules();
  const activityRule = r.uart.activity;
  if (!activityRule || !activityRule.notify) return;
  const ruleId = "uart.activity";
  const cooldownSec = typeof activityRule.cooldown_sec === "number" ? activityRule.cooldown_sec : 60;
  if (!state.shouldFire(ruleId, cooldownSec)) return;
  notifier.notify(activityRule.notify);
  state.recordFire(ruleId);
}

module.exports = { handleGPIOEvent, handleUARTActivity };
module.exports.notifier = notifier;
