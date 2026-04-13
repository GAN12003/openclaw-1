"use strict";

/**
 * When suppression is on (default), Piclaw skips Telegram nags about incomplete integrations:
 * boot DM, Thoughts lines, agency notify_owner, motivation notify_owner experiments.
 * Set PICLAW_SUPPRESS_EMBODIMENT_REMINDERS=0 (or false/off/no) to receive those reminders again.
 */
function isSuppressEmbodimentReminders() {
  const v = String(process.env.PICLAW_SUPPRESS_EMBODIMENT_REMINDERS || "1")
    .trim()
    .toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

module.exports = { isSuppressEmbodimentReminders };
