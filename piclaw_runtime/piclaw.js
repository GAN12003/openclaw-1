#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, ".env");
try {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (key) process.env[key] = val;
    }
  }
} catch (_) {}

/**
 * Piclaw — minimal embedded runtime for Raspberry Pi.
 * Standalone: no OpenClaw code. Starts Telegram bot and aggregates system data.
 */

const identity = require("./core/identity");
const identityBridge = require("./identity_bridge");
const watchdog = require("./core/watchdog");
const health = require("./system/health");
const wifi = require("./system/wifi");
const budget = require("./system/budget");
const telegram = require("./comms/telegram");
const wifiStatus = require("./sensors/wifi_status");
const powerStatus = require("./sensors/power_status");
const connectivity = require("./sensors/connectivity");
const filesystemView = require("./introspection/filesystem_view");
const processInfo = require("./introspection/process_info");
const versionState = require("./introspection/version_state");
const integrations = require("./integrations/registry");
const githubApi = require("./integrations/github_api");
const smtpApi = require("./integrations/smtp_api");
const twitterApiBridge = require("./integrations/twitter_api_bridge");
const uartProbeBridge = require("./integrations/uart_probe_bridge");
const billingStatus = require("./economy/billing_status");
const walletStatus = require("./economy/wallet_status");
const policy = require("./economy/policy");
const selfInspect = require("./core/self_inspect");
const updateChannel = require("./core/update_channel");
const updateProbe = require("./update_probe/scheduler");
const goalLoop = require("./goal_loop/scheduler");
const uartIdentity = require("./uart_identity/matcher");
const detectPlatform = require("./hardware/detect_platform");
const uartWatch = require("./hardware/uart_watch");
const gpioWatch = require("./hardware/gpio_watch");
const hardwareState = require("./hardware/hardware_state");
const gpioControl = require("./hardware/gpio_control");
const eventEngine = require("./events/engine");
const eventNotifier = require("./events/notifier");

const runtime_state = { environment: null };

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[piclaw] ${ts} ${msg}`);
}

async function buildStatusText() {
  const [h, w, b] = await Promise.all([
    health.getHealth(),
    wifi.getWifi(),
    Promise.resolve(budget.getBudget()),
  ]);

  const tempStr = h.cpuTemp != null ? `${h.cpuTemp}°C` : "n/a";
  const uptimeStr = health.formatUptime(h.uptimeSec);
  const ssidStr = w.ssid || "n/a";
  const signalStr = w.signal != null ? `${w.signal}` : "n/a";
  const budgetStr = `$${b.usedUsd.toFixed(2)} / $${b.dailyLimitUsd.toFixed(2)}`;

  const id = identity.loadIdentity();
  const fsView = filesystemView.getFilesystemView();
  const proc = processInfo.getProcessInfo();
  const ver = versionState.getVersionState();

  const env = runtime_state.environment;
  let envBlock = [];
  if (env) {
    const wifiStr = env.wifi?.connected
      ? `${env.wifi.ssid || "wlan"} (${env.wifi.signal || "n/a"})`
      : "not available";
    const connStr = env.connectivity?.online ? "ONLINE" : "ISOLATED";
    let powerStr = "Healthy";
    if (env.power?.unknown) {
      powerStr = "unavailable (non-Pi platform)";
    } else if (env.power) {
      if (env.power.undervoltage_now || env.power.throttled) {
        powerStr = [env.power.undervoltage_now && "undervoltage", env.power.throttled && "throttled", env.power.undervoltage_past && "undervoltage (past)"].filter(Boolean).join(", ") || "Healthy";
      }
    }
    envBlock = [
      "",
      "<b>Environment</b>",
      `WiFi: ${wifiStr}`,
      `Connectivity: ${connStr}`,
      `Power: ${powerStr}`,
    ];
  }

  const systemBlock = [
    "",
    "<b>System</b>",
    `Disk Free: ${fsView.diskFree}`,
    `Runtime Path: ${fsView.runtimeDir}`,
    `Memory: ${proc.memory_usage}`,
  ];
  const processBlock = [
    "",
    "<b>Process</b>",
    `PID: ${proc.pid}`,
    `Uptime: ${proc.uptime} sec`,
  ];
  const versionBlock = [
    "",
    "<b>Version</b>",
    ver.version,
  ];

  const intStatus = integrations.checkIntegrations();
  const intLines = ["github", "twitter", "smtp", "moltbook"].map(
    (name) => `${name.charAt(0).toUpperCase() + name.slice(1)}: ${intStatus.configured.includes(name) ? "OK" : "MISSING"}`
  );
  let githubAuthLine = "";
  try {
    const gh = await githubApi.getGitHubAuthStatus();
    if (gh.configured && gh.ok && gh.login) {
      githubAuthLine = `GitHub Auth: OK (@${gh.login})`;
    } else if (gh.configured && !gh.ok) {
      githubAuthLine = `GitHub Auth: FAILED (${gh.reason || "unknown"})`;
    } else {
      githubAuthLine = "GitHub Auth: not configured";
    }
  } catch (_) {
    githubAuthLine = "GitHub Auth: error";
  }
  const integrationsBlock = [
    "",
    "<b>Integrations</b>",
    ...intLines,
    githubAuthLine || "",
  ].filter(Boolean);

  const billing = billingStatus.getBillingStatus();
  const wallet = walletStatus.getWalletStatus();
  const pol = policy.getPolicy();
  const billingStr = billing.key_configured ? "configured" : "missing";
  const walletStr = wallet.address_known ? "known" : "unknown";
  const autonomyStr = pol.autonomous_spending ? "enabled" : "restricted";
  const economyBlock = [
    "",
    "<b>Economy</b>",
    `Billing: ${billingStr}`,
    `Wallet: ${walletStr}`,
    `Autonomy: ${autonomyStr}`,
  ];

  let hardwareBlock = [];
  if (detectPlatform.isRaspberryPi()) {
    const hw = hardwareState.getHardwareState();
    const uartLine = hw.uart.active
      ? `UART: ${hw.uart.last_seen || "listening"} (${hw.uart.bytes} bytes)`
      : "UART: idle";
    const gpioLine = hw.gpio.monitored.length > 0
      ? `GPIO: ${hw.gpio.monitored.join(",")} — ${hw.gpio.last_events.length} recent events`
      : "GPIO: none";
    hardwareBlock = [
      "",
      "<b>Hardware</b>",
      `Summary: ${hw.summary}`,
      uartLine,
      gpioLine,
    ];
  }

  return [
    "<b>Piclaw status</b>",
    "",
    `<b>Identity</b>`,
    `device_id: ${id.device_id}`,
    `first_boot: ${id.first_boot}`,
    `hostname: ${id.hostname} (${id.platform}/${id.arch})`,
    ...envBlock,
    ...systemBlock,
    ...processBlock,
    ...versionBlock,
    ...integrationsBlock,
    ...economyBlock,
    ...hardwareBlock,
    "",
    `CPU temp: ${tempStr}`,
    `Uptime: ${uptimeStr}`,
    `WiFi: ${ssidStr} (signal: ${signalStr})`,
    `API budget: ${budgetStr}`,
  ].join("\n");
}

function buildWhoamiText() {
  const fallback = identity.loadIdentity();
  if (!identityBridge.isAvailable()) {
    return [
      "<b>Whoami</b>",
      `device_id: ${fallback.device_id || "n/a"}`,
      "mission: (identity layer not configured)",
      "goals: —",
      "",
      "Identity layer: not configured",
    ].join("\n");
  }
  const self = identityBridge.loadSelf();
  const goals = identityBridge.loadGoals();
  const lt = (goals.long_term || []).length;
  const mt = (goals.mid_term || []).length;
  const st = (goals.short_term || []).length;
  const goalSummary = `long: ${lt}, mid: ${mt}, short: ${st}`;
  const missionLine = self.mission ? `mission: ${self.mission}` : "mission: —";
  return [
    "<b>Whoami</b>",
    `device_id: ${self.device_id || fallback.device_id || "n/a"}`,
    missionLine,
    `goals: ${goalSummary}`,
  ].join("\n");
}

function buildUartDevicesText() {
  const registry = require("./uart_identity/registry");
  const data = registry.load();
  const devices = data.devices || [];
  if (devices.length === 0) {
    return "No UART devices registered yet. Run /probe_uart to add.";
  }
  const sorted = [...devices].sort((a, b) => (b.last_seen || "").localeCompare(a.last_seen || ""));
  const lines = ["<b>UART devices</b>", ""];
  for (const d of sorted) {
    const baud = (d.fingerprint && d.fingerprint.baud) ?? "?";
    const traffic = (d.fingerprint && d.fingerprint.traffic) || "?";
    const seen = d.seen_count ?? 0;
    const labelPart = d.label ? ` (${d.label})` : "";
    lines.push(`${d.id || "—"}${labelPart} (${traffic} @${baud}) seen ${seen}x`);
  }
  return lines.join("\n");
}

/**
 * Set human-readable label on a UART registry device. Identity/matcher never use this.
 * Uses existing registry load/save and appends to experience log.
 */
function setUartLabel(id, label) {
  if (!identityBridge.isAvailable()) {
    return { ok: false, reason: "identity not available" };
  }
  const registry = require("./uart_identity/registry");
  const data = registry.load();
  const devices = data.devices || [];
  let device = devices.find((d) => d.id === id);
  if (!device && !id.startsWith("uart-")) {
    device = devices.find((d) => d.id === "uart-" + id);
  }
  if (!device) {
    return { ok: false, reason: "device not found" };
  }
  device.label = typeof label === "string" ? label : String(label ?? "");
  if (!registry.save(devices)) {
    return { ok: false, reason: "save failed" };
  }
  identityBridge.appendExperience(`labeled ${device.id} as "${device.label}"`);
  return { ok: true };
}

function buildReviewStatusText() {
  if (!identityBridge.isAvailable()) {
    return "Identity layer not configured.";
  }
  const last = identityBridge.getLastReview();
  if (!last || typeof last !== "object") {
    return "No review run yet.";
  }
  const at = last.at || "—";
  const result = last.result || "—";
  const duration = last.duration_ms != null ? String(last.duration_ms) : "—";
  const reason = last.reason ? ` reason=${last.reason}` : "";
  return `<b>Last review</b>\nat: ${at}\nresult: ${result}\nduration_ms: ${duration}${reason}`;
}

const BOOT_OK_PATH = path.join(__dirname, ".boot-ok");
const HEARTBEAT_PATH = path.join(__dirname, "heartbeat.json");
const STALE_HEARTBEAT_MS = 90_000; // if last heartbeat older than this, treat as unexpected shutdown

async function main() {
  log("starting");
  try {
    fs.unlinkSync(BOOT_OK_PATH);
  } catch (_) {}

  try {
    const raw = fs.readFileSync(HEARTBEAT_PATH, "utf8");
    const hb = JSON.parse(raw);
    const last = hb.last_seen ? new Date(hb.last_seen).getTime() : 0;
    if (last && Date.now() - last > STALE_HEARTBEAT_MS) {
      log("recovered from unexpected shutdown");
    }
  } catch (_) {}

  const id = identity.loadIdentity();
  log(`device_id: ${id.device_id}`);
  log(`first_boot: ${id.first_boot}`);

  const intStatus = integrations.checkIntegrations();
  if (!intStatus.complete) {
    log(`embodiment incomplete — missing: ${intStatus.missing.join(", ")}`);
  }

  watchdog.startWatchdog();
  log("watchdog active");

  identityBridge.validateIdentity();
  identityBridge.warnIdentityPermissions();
  identityBridge.freezeAvailability();

  const bot = telegram.createBot(buildStatusText, {
    getWhoamiText: () => buildWhoamiText(),
    getReviewStatusText: () => buildReviewStatusText(),
    getGitHubStatus: () => githubApi.getGitHubAuthStatus(),
    sendTestMail: () => smtpApi.sendTestMail(),
    getTwitterStatus: () => twitterApiBridge.getTwitterStatus(),
    getSelfInspection: () => selfInspect.getSelfInspectionAsync(),
    getHardwareState: () => (detectPlatform.isRaspberryPi() ? hardwareState.getHardwareState() : { uart: { active: false }, gpio: { monitored: [], last_events: [] }, summary: "n/a (not Raspberry Pi)" }),
    gpioControl: {
      getControlConfig: () => gpioControl.getControlConfig(),
      pulsePin: (pin, ms) => gpioControl.pulsePin(pin, ms),
      setPinFor: (pin, value, sec) => gpioControl.setPinFor(pin, value, sec),
    },
    runUARTProbe: async () => {
      if (detectPlatform.isRaspberryPi()) {
        uartWatch.pauseUARTWatch();
        log("pausing uart monitor");
      }
      log("running probe");
      try {
        return await uartProbeBridge.runUARTProbe();
      } finally {
        if (detectPlatform.isRaspberryPi()) {
          uartWatch.resumeUARTWatch();
          log("resuming uart monitor");
        }
      }
    },
    identifyUartDevice: (result) => uartIdentity.identifyDevice(result),
    getUartDevicesText: () => buildUartDevicesText(),
    setUartLabel: (id, label) => setUartLabel(id, label),
    requestUpdate: () => updateChannel.requestUpdate(),
  });
  if (bot) {
    log("Telegram bot started (responds to /status)");
  } else {
    log("PICLAW_TELEGRAM_TOKEN not set — Telegram disabled");
  }

  const notifyChatId = (process.env.PICLAW_TELEGRAM_CHAT_ID || "").trim();
  eventNotifier.setNotifyTarget(bot, notifyChatId);

  updateProbe.startUpdateScheduler((info) => {
    log(`update available: ${info.latest_version} (current ${info.current_version})`);
    if (bot && notifyChatId) {
      bot.sendMessage(
        notifyChatId,
        `Update available: ${info.latest_version} (current ${info.current_version}). Use /update to apply.`
      ).catch(() => {});
    }
  });

  goalLoop.start();
  log("goal loop scheduled");

  if (detectPlatform.isRaspberryPi()) {
    uartWatch.startUARTWatch({
      onActivity: (p) => {
        log(`uart activity detected on ${p}`);
        eventEngine.handleUARTActivity({ device: p });
      },
    });
    gpioWatch.startGPIOWatch({
      onEvent: (ev) => {
        log(`gpio${ev.gpio} changed ${ev.value}`);
        eventEngine.handleGPIOEvent(ev);
      },
    });
    log("hardware sensing active");
  }

  async function senseEnv() {
    const wifi = wifiStatus.getWifiStatus();
    const power = powerStatus.getPowerStatus();
    const net = await connectivity.checkConnectivity();
    runtime_state.environment = { wifi, power, connectivity: net };
    const sig = wifi.signal != null ? wifi.signal : "n/a";
    log(`env update: online=${net.online} signal=${sig}`);
  }

  senseEnv();
  setInterval(senseEnv, 30_000);

  log("ready");
  try {
    fs.writeFileSync(BOOT_OK_PATH, new Date().toISOString(), "utf8");
  } catch (_) {}
}

main().catch((err) => {
  console.error("[piclaw] fatal:", err);
  process.exit(1);
});
