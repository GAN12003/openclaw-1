"use strict";

/**
 * Periodic host metrics: CPU/memory/disk (systeminformation), network reachability (connectivity),
 * optional CPU temp/uptime (health.js). Appends NDJSON to SAFE_ROOT/logs/host-health.ndjson,
 * rotates when PICLAW_HEALTH_LOG_MAX_BYTES exceeded, optional Telegram alerts on thresholds.
 *
 * Environment (all optional):
 * - PICLAW_HEALTH_ENABLE=1 — set 0 to disable (default 1).
 * - PICLAW_HEALTH_INTERVAL_SEC — sample interval (default 300).
 * - PICLAW_HEALTH_ALERT_ENABLE=1 — set 0 to log only (default 1).
 * - PICLAW_HEALTH_MEM_PCT — alert if system memory use % above (default 90).
 * - PICLAW_HEALTH_CPU_PCT — alert if current CPU load % above (default 95).
 * - PICLAW_HEALTH_DISK_USE_PCT — alert if disk use % above (default 95).
 * - PICLAW_HEALTH_DISK_FREE_MB — alert if free space below this many MB (default 500).
 * - PICLAW_HEALTH_LOG_MAX_BYTES — rotate active log when larger (default 5242880 = 5 MiB).
 * - PICLAW_HEALTH_ARCHIVE_MAX_FILES — keep at most this many rotated archives in logs/ (default 8); oldest deleted.
 * - PICLAW_HEALTH_ALERT_COOLDOWN_MS — min ms between alerts of same type (default 600000).
 * - PICLAW_HEALTH_CONNECTIVITY_LATENCY_MS — if positive, alert when AI API path latency exceeds this many ms (default 0 = off).
 */

const fs = require("fs");
const path = require("path");
const si = require("systeminformation");
const { SAFE_ROOT } = require("../core/self_guard");
const { getProcessMemorySnapshot } = require("../introspection/process_info");
const connectivity = require("../sensors/connectivity");
const health = require("./health");

const LOG_REL = path.join("logs", "host-health.ndjson");

function envBool(key, defaultVal) {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultVal;
  return !/^(0|false|no|off)$/i.test(String(v).trim());
}

function envNum(key, defaultVal) {
  const n = parseFloat(process.env[key]);
  return Number.isFinite(n) ? n : defaultVal;
}

function pickFsForPath(fsRows, targetPath) {
  if (!fsRows || fsRows.length === 0) return null;
  const norm = path.resolve(targetPath);
  let best = null;
  let bestLen = -1;
  for (const row of fsRows) {
    const mp = row.mount || "";
    if (!mp) continue;
    if (norm === mp || norm.startsWith(mp + path.sep) || (mp === "/" && norm.startsWith("/"))) {
      if (mp.length > bestLen) {
        best = row;
        bestLen = mp.length;
      }
    }
  }
  return best || fsRows[0];
}

/**
 * @param {object} deps
 * @param { { environment?: object | null, hostMetrics?: object | null } } deps.runtimeState — mutated with latest snapshot
 * @param { (msg: string) => void } deps.notify — e.g. eventNotifier.notify
 */
function startHostHealthWatch(deps) {
  const runtimeState = deps && deps.runtimeState;
  const notify = typeof deps.notify === "function" ? deps.notify : () => {};

  if (!envBool("PICLAW_HEALTH_ENABLE", true)) {
    return;
  }

  const intervalSec = Math.max(30, envNum("PICLAW_HEALTH_INTERVAL_SEC", 300));
  const intervalMs = Math.round(intervalSec * 1000);
  const alertsOn = envBool("PICLAW_HEALTH_ALERT_ENABLE", true);
  const memThreshold = envNum("PICLAW_HEALTH_MEM_PCT", 90);
  const cpuThreshold = envNum("PICLAW_HEALTH_CPU_PCT", 95);
  const diskUseThreshold = envNum("PICLAW_HEALTH_DISK_USE_PCT", 95);
  const diskFreeMbThreshold = envNum("PICLAW_HEALTH_DISK_FREE_MB", 500);
  const maxLogBytes = Math.max(64 * 1024, envNum("PICLAW_HEALTH_LOG_MAX_BYTES", 5 * 1024 * 1024));
  const maxArchiveFiles = Math.max(0, Math.floor(envNum("PICLAW_HEALTH_ARCHIVE_MAX_FILES", 8)));
  const cooldownMs = Math.max(60_000, envNum("PICLAW_HEALTH_ALERT_COOLDOWN_MS", 600_000));
  const latencyAlertThreshold = Math.max(0, envNum("PICLAW_HEALTH_CONNECTIVITY_LATENCY_MS", 0));

  const logPath = path.join(SAFE_ROOT, LOG_REL);
  const logDir = path.dirname(logPath);
  const archivePrefix = "host-health-archive-";

  /** @type { boolean | null } — null until first sample (avoids spurious alerts at boot). */
  let prevOnline = null;
  const lastAlertAt = /** @type { Record<string, number> } */ ({});

  function canAlert(kind) {
    const now = Date.now();
    const last = lastAlertAt[kind] || 0;
    if (now - last < cooldownMs) return false;
    lastAlertAt[kind] = now;
    return true;
  }

  function pruneArchives() {
    if (maxArchiveFiles <= 0) return;
    try {
      if (!fs.existsSync(logDir)) return;
      const names = fs
        .readdirSync(logDir)
        .filter((n) => n.startsWith(archivePrefix) && n.endsWith(".ndjson"))
        .map((n) => ({
          n,
          p: path.join(logDir, n),
          m: (() => {
            try {
              return fs.statSync(path.join(logDir, n)).mtimeMs;
            } catch (_) {
              return 0;
            }
          })(),
        }))
        .sort((a, b) => a.m - b.m);
      while (names.length > maxArchiveFiles) {
        const victim = names.shift();
        if (!victim) break;
        try {
          fs.unlinkSync(victim.p);
        } catch (_) {}
      }
    } catch (_) {}
  }

  /** Rename active log to host-health-archive-<ms>.ndjson; next append creates a fresh file. */
  function rotateIfNeeded() {
    try {
      if (!fs.existsSync(logPath)) return;
      const st = fs.statSync(logPath);
      if (st.size <= maxLogBytes) return;
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      const archiveName = `${archivePrefix}${Date.now()}.ndjson`;
      const archivePath = path.join(logDir, archiveName);
      fs.renameSync(logPath, archivePath);
      pruneArchives();
    } catch (_) {}
  }

  function appendLine(obj) {
    try {
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      rotateIfNeeded();
      fs.appendFileSync(logPath, JSON.stringify(obj) + "\n", "utf8");
    } catch (_) {}
  }

  async function tick() {
    let cpuLoadPct = null;
    let memPct = null;
    let diskUsePct = null;
    let diskFreeMb = null;
    let diskMount = null;
    let online = true;
    let dnsMs = null;
    let tcpMs = null;
    let connectivityLatencyMs = null;
    let cpuTemp = null;
    let uptimeSec = null;

    try {
      const load = await Promise.resolve(si.currentLoad()).catch(() => null);
      if (load && typeof load.currentload === "number") {
        cpuLoadPct = Math.round(load.currentload * 10) / 10;
      }
    } catch (_) {}

    try {
      const mem = await Promise.resolve(si.mem()).catch(() => null);
      if (mem && mem.total > 0) {
        memPct = Math.round((mem.used / mem.total) * 1000) / 10;
      }
    } catch (_) {}

    try {
      const fsRows = await Promise.resolve(si.fsSize()).catch(() => []);
      const row = Array.isArray(fsRows) ? pickFsForPath(fsRows, SAFE_ROOT) : null;
      if (row && typeof row.use === "number") {
        diskUsePct = Math.round(row.use * 10) / 10;
        diskMount = row.mount || null;
        const avail = row.available != null ? row.available : Math.max(0, (row.size || 0) - (row.used || 0));
        diskFreeMb = Math.round((avail / (1024 * 1024)) * 10) / 10;
      }
    } catch (_) {}

    try {
      const net = await connectivity.checkConnectivity({ full: true });
      online = !!net.online;
      if (typeof net.dns_ms === "number" && Number.isFinite(net.dns_ms)) dnsMs = Math.round(net.dns_ms);
      if (typeof net.tcp_ms === "number" && Number.isFinite(net.tcp_ms)) tcpMs = Math.round(net.tcp_ms);
      if (typeof net.latency_ms === "number" && Number.isFinite(net.latency_ms)) {
        connectivityLatencyMs = Math.round(net.latency_ms);
      }
    } catch (_) {
      online = false;
    }

    let uartBytesTotal = null;
    let gpioRecentEvents = null;
    try {
      const uart_watch = require("../hardware/uart_watch");
      uartBytesTotal = uart_watch.getUARTStatus().bytes;
      const gpio_watch = require("../hardware/gpio_watch");
      gpioRecentEvents = gpio_watch.getGPIOStatus().last_events.length;
    } catch (_) {}

    try {
      const h = await health.getHealth();
      cpuTemp = h.cpuTemp;
      uptimeSec = h.uptimeSec;
    } catch (_) {}

    let processPid = null;
    let processRssMb = null;
    let processHeapUsedMb = null;
    try {
      const pm = getProcessMemorySnapshot();
      processPid = pm.pid;
      processRssMb = pm.rssMb;
      processHeapUsedMb = pm.heapUsedMb;
    } catch (_) {}

    const ts = new Date().toISOString();
    const snapshot = {
      ts,
      cpuLoadPct,
      memPct,
      diskUsePct,
      diskFreeMb,
      diskMount,
      online,
      dnsMs,
      tcpMs,
      connectivityLatencyMs,
      cpuTemp,
      uptimeSec,
      processPid,
      processRssMb,
      processHeapUsedMb,
      uartBytesTotal,
      gpioRecentEvents,
    };

    if (runtimeState) {
      runtimeState.hostMetrics = snapshot;
    }

    appendLine(snapshot);

    if (!alertsOn) return;

    if (memPct != null && memPct > memThreshold && canAlert("mem")) {
      notify(`Host health: memory use ${memPct}% (threshold ${memThreshold}%).`);
    }
    if (cpuLoadPct != null && cpuLoadPct > cpuThreshold && canAlert("cpu")) {
      notify(`Host health: CPU load ${cpuLoadPct}% (threshold ${cpuThreshold}%).`);
    }
    if (diskUsePct != null && diskUsePct > diskUseThreshold && canAlert("disk_use")) {
      notify(`Host health: disk use ${diskUsePct}% on ${diskMount || "?"} (threshold ${diskUseThreshold}%).`);
    }
    if (diskFreeMb != null && diskFreeMb < diskFreeMbThreshold && canAlert("disk_free")) {
      notify(
        `Host health: disk free ${diskFreeMb} MB on ${diskMount || "?"} (min ${diskFreeMbThreshold} MB).`
      );
    }

    if (prevOnline !== null) {
      if (prevOnline && !online && canAlert("net_down")) {
        notify("Host health: connectivity lost (TCP to AI API host failed).");
      }
      if (!prevOnline && online && canAlert("net_up")) {
        notify("Host health: connectivity restored.");
      }
    }
    prevOnline = online;

    if (
      latencyAlertThreshold > 0 &&
      connectivityLatencyMs != null &&
      connectivityLatencyMs > latencyAlertThreshold &&
      online &&
      canAlert("latency")
    ) {
      notify(
        `Host health: AI API path latency ${connectivityLatencyMs}ms (threshold ${latencyAlertThreshold}ms).`
      );
    }
  }

  const firstDelayMs = Math.min(15_000, intervalMs);
  setTimeout(() => {
    tick().catch(() => {});
    setInterval(() => {
      tick().catch(() => {});
    }, intervalMs);
  }, firstDelayMs);
}

module.exports = { startHostHealthWatch };
