"use strict";

/**
 * Optional I2C LCD 1602 (16x2) display. When PICLAW_LCD_ENABLED=1, expressions
 * (say()) are shown on the display. Lazy-init; if require or open fails, LCD is
 * disabled for the process. Requires: npm install lcdi2c (and I2C enabled on Pi).
 */

const COLUMNS = 16;
const ROWS = 2;

let lcdInstance = null;
let lcdDisabled = false;

function isEnabled() {
  return process.env.PICLAW_LCD_ENABLED === "1";
}

function getAddr() {
  const raw = (process.env.PICLAW_LCD_I2C_ADDR || "0x27").trim();
  const n = parseInt(raw, 16);
  return Number.isNaN(n) ? 0x27 : n;
}

const lineBuffer = [];

/**
 * Get LCD instance (lazy). Returns null if disabled, not installed, or init failed.
 */
function getLcd() {
  if (!isEnabled() || lcdDisabled) return null;
  if (lcdInstance) return lcdInstance;
  try {
    const LCD = require("lcdi2c");
    const addr = getAddr();
    lcdInstance = new LCD(1, addr, COLUMNS, ROWS);
    return lcdInstance;
  } catch (_) {
    lcdDisabled = true;
    return null;
  }
}

/**
 * Write two lines to the display (truncated to COLUMNS). Clears then prints.
 */
function writeLines(line1, line2) {
  const lcd = getLcd();
  if (!lcd) return;
  try {
    lcd.clear();
    const s1 = (line1 != null ? String(line1) : "").slice(0, COLUMNS);
    const s2 = (line2 != null ? String(line2) : "").slice(0, COLUMNS);
    if (s1) lcd.println(s1, 1);
    if (s2) lcd.println(s2, 2);
  } catch (_) {
    lcdDisabled = true;
  }
}

/**
 * Push a new line into the 2-line buffer and refresh the display. Called from express.say().
 */
function pushLine(line) {
  if (!line || typeof line !== "string") return;
  const trimmed = line.trim().slice(0, COLUMNS);
  if (!trimmed) return;
  lineBuffer.push(trimmed);
  if (lineBuffer.length > ROWS) lineBuffer.shift();
  const l1 = lineBuffer.length >= 2 ? lineBuffer[lineBuffer.length - 2] : "";
  const l2 = lineBuffer[lineBuffer.length - 1] || "";
  writeLines(l1, l2);
}

module.exports = { isEnabled, getLcd, writeLines, pushLine };
