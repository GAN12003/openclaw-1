"use strict";

const fs = require("fs");
const path = require("path");

const RULES_FILE = path.join(__dirname, "rules.json");

const EMPTY_RULES = { gpio: {}, uart: {} };

function getRules() {
  try {
    const raw = fs.readFileSync(RULES_FILE, "utf8");
    const data = JSON.parse(raw);
    return {
      gpio: data.gpio && typeof data.gpio === "object" ? data.gpio : {},
      uart: data.uart && typeof data.uart === "object" ? data.uart : {},
    };
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  return { ...EMPTY_RULES };
}

module.exports = { getRules };
