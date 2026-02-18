"use strict";

const check_remote = require("./check_remote");
const state = require("./state");

const DEFAULT_INTERVAL_HOURS = 12;
const FIRST_RUN_DELAY_MS = 60_000; // 1 minute after boot

/**
 * Start periodic update checks. When a new version is available and not yet notified,
 * calls notifyFn({ latest_version, current_version }). Does not auto-update.
 * Fails silently on network errors; retries next interval.
 *
 * @param { (info: { latest_version: string, current_version: string }) => void } notifyFn
 */
function startUpdateScheduler(notifyFn) {
  const raw = process.env.PICLAW_UPDATE_INTERVAL_HOURS || String(DEFAULT_INTERVAL_HOURS);
  const hours = Math.max(0.5, parseFloat(raw) || DEFAULT_INTERVAL_HOURS);
  const intervalMs = Math.round(hours * 60 * 60 * 1000);

  async function runCheck() {
    try {
      const probeState = state.loadProbeState();
      const result = await check_remote.checkRemote();
      state.saveProbeState({
        ...probeState,
        last_checked: new Date().toISOString(),
      });

      if (result.update_available && result.latest_version !== probeState.last_notified_version) {
        if (typeof notifyFn === "function") {
          notifyFn({ latest_version: result.latest_version, current_version: result.current_version });
        }
        state.saveProbeState({
          last_checked: new Date().toISOString(),
          last_notified_version: result.latest_version,
        });
      }
    } catch (_) {
      // fail silently; retry next interval
    }
  }

  setTimeout(() => {
    runCheck();
    setInterval(runCheck, intervalMs);
  }, FIRST_RUN_DELAY_MS);
}

module.exports = { startUpdateScheduler };
