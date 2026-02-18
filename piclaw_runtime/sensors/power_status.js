"use strict";

const { execSync } = require("child_process");

/**
 * Raspberry Pi throttling / undervoltage from vcgencmd get_throttled.
 * Returns { unknown: true } on non-Pi (Windows/WSL) or when vcgencmd missing.
 *
 * Pi throttled hex: bit 0 = undervoltage now, bit 2 = throttled now,
 * bit 16 = undervoltage past, bit 18 = throttling past.
 */
function getPowerStatus() {
  try {
    const out = execSync("vcgencmd get_throttled", { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] });
    const m = out.match(/throttled=(0x[0-9a-fA-F]+)/);
    if (!m) return { unknown: true };

    const value = parseInt(m[1], 16);
    const undervoltage_now = (value & 0x1) !== 0;
    const undervoltage_past = (value & 0x10000) !== 0;
    const throttled = (value & 0x4) !== 0 || (value & 0x40000) !== 0;

    return { throttled, undervoltage_now, undervoltage_past };
  } catch (_) {
    return { unknown: true };
  }
}

module.exports = { getPowerStatus };
