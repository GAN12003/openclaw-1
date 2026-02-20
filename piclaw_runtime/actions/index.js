"use strict";

/**
 * Bounded action layer: every autonomous action goes through perform(), is logged to ledger, and budget-checked.
 * Phase 1: repo_scan (read-only), update_check, probe_uart, notify_owner.
 */

const identityBridge = require("../identity_bridge");
const costModel = require("../economy/cost_model");
const budgetGuard = require("../economy/budget_guard");

const ALLOWED_TYPES = new Set(["repo_scan", "update_check", "probe_uart", "notify_owner"]);

function repoScanSync() {
  try {
    const fsView = require("../introspection/filesystem_view");
    const view = fsView.getView();
    const list = fsView.listRuntimeDir(".");
    const dirs = Array.isArray(list) ? list.filter((n) => n && !n.startsWith(".")) : [];
    const summary = {
      runtimeDir: view.runtimeDir,
      diskFree: view.diskFree,
      topLevelDirs: dirs.slice(0, 30),
    };
    return { ok: true, message: "repo_scan: " + JSON.stringify(summary).slice(0, 200) };
  } catch (e) {
    return { ok: false, message: (e && e.message) || "repo_scan failed" };
  }
}

/**
 * Execute one action. Logs to ledger; checks budget; runs action (sync repo_scan, async others via runAction).
 * @param {{ type: string, reason?: string }} action
 * @param {{ runAction?: (actionType: string, payload: object) => Promise<{ ok: boolean, message?: string }> }} options
 * @returns {Promise<{ ok: boolean, message?: string, reason?: string }>}
 */
async function perform(action, options) {
  const type = action && typeof action.type === "string" ? action.type.trim().toLowerCase() : "";
  if (!ALLOWED_TYPES.has(type)) {
    const entry = { ts: new Date().toISOString(), action: type, result: "denied", reason: "disallowed_type" };
    try {
      identityBridge.appendLedgerLine(entry);
    } catch (_) {}
    return { ok: false, reason: "disallowed_type" };
  }

  const cost = costModel.estimateCost(type);
  try {
    budgetGuard.ensureDailyReset();
    if (!budgetGuard.canSpend(cost)) {
      const entry = { ts: new Date().toISOString(), action: type, result: "denied", reason: "budget_exceeded" };
      identityBridge.appendLedgerLine(entry);
      return { ok: false, reason: "budget_exceeded" };
    }
  } catch (_) {}

  let result;
  try {
    if (type === "repo_scan") {
      result = repoScanSync();
    } else {
      const runAction = options && typeof options.runAction === "function" ? options.runAction : null;
      if (!runAction) {
        result = { ok: false, message: "no runAction provided" };
      } else {
        const actionType = type === "update_check" ? "check_updates" : type;
        const payload = type === "notify_owner" ? { type: "notify_owner", reason: action.reason || "Builder-Researcher experiment" } : { type: actionType };
        result = await runAction(actionType, payload);
      }
    }
  } catch (e) {
    result = { ok: false, message: (e && e.message) || "action failed" };
  }

  try {
    budgetGuard.recordSpend(cost);
  } catch (_) {}

  const entry = {
    ts: new Date().toISOString(),
    action: type,
    result: result.ok ? "ok" : "fail",
    message: result.message,
  };
  try {
    identityBridge.appendLedgerLine(entry);
  } catch (_) {}

  return result.ok ? { ok: true, message: result.message } : { ok: false, message: result.message, reason: "execution_failed" };
}

module.exports = { perform, ALLOWED_TYPES };
