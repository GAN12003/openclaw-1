"use strict";

const lastFire = {};

function shouldFire(ruleId, cooldownSec) {
  if (!ruleId || cooldownSec == null || cooldownSec < 0) return true;
  const t = lastFire[ruleId];
  if (t == null) return true;
  return (Date.now() - t) / 1000 >= cooldownSec;
}

function recordFire(ruleId) {
  if (ruleId) lastFire[ruleId] = Date.now();
}

module.exports = { shouldFire, recordFire };
