"use strict";

/**
 * When PICLAW_SUPPRESS_EMBODIMENT_REMINDERS is truthy (1/true/yes), Piclaw skips optional
 * Telegram nags about incomplete integrations: boot DM, Thoughts lines, agency notify_owner,
 * and motivation candidates that only remind about missing integrations.
 */
function isSuppressEmbodimentReminders() {
  const v = String(process.env.PICLAW_SUPPRESS_EMBODIMENT_REMINDERS || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

module.exports = { isSuppressEmbodimentReminders };
