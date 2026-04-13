#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

/** Split comma/whitespace-separated env lists (Telegram ids). */
function parseCommaSeparatedEnv(value) {
  return String(value || "")
    .trim()
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Load KEY=value from runtime .env; do not wipe PICLAW_TELEGRAM_CHAT_ID with an empty line (common placeholder). */
function loadRuntimeDotEnv(envPath) {
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!key) continue;
      if (
        key === "PICLAW_TELEGRAM_CHAT_ID" &&
        val === "" &&
        process.env[key] &&
        String(process.env[key]).trim() !== ""
      ) {
        continue;
      }
      process.env[key] = val;
    }
  } catch (_) {}
}

loadRuntimeDotEnv(path.join(__dirname, ".env"));

/**
 * Piclaw — minimal embedded runtime for Raspberry Pi.
 * Standalone: no OpenClaw code. Starts Telegram bot and aggregates system data.
 */

const identity = require("./core/identity");
const embodimentReminders = require("./core/embodiment_reminders");
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
const openaiChat = require("./integrations/openai_chat");
const execRun = require("./core/exec_run");
const selfGuard = require("./core/self_guard");
const updateProbe = require("./update_probe/scheduler");
const goalLoop = require("./goal_loop/scheduler");
const agencyLoop = require("./agency/agency_loop");
const presenceLoop = require("./presence_loop");
const motivationScheduler = require("./motivation/scheduler");
const actionsLayer = require("./actions");
const codexAuth = require("./integrations/codex_auth");
const skillsLoader = require("./skills_loader");
const uartIdentity = require("./uart_identity/matcher");
const detectPlatform = require("./hardware/detect_platform");
const uartWatch = require("./hardware/uart_watch");
const gpioWatch = require("./hardware/gpio_watch");
const hardwareState = require("./hardware/hardware_state");
const gpioControl = require("./hardware/gpio_control");
const eventEngine = require("./events/engine");
const eventNotifier = require("./events/notifier");
const perception = require("./perception/perceive");
const bodyScan = require("./introspection/body_scan");
const express = require("./perception/express");
const envAppend = require("./core/env_append");
const gitAgentStatus = require("./integrations/git_agent_status");
const hostHealthWatch = require("./system/host_health_watch");

const runtime_state = { environment: null, hostMetrics: null };
const pendingEnvKeyByChat = {};

/** Summarize recent openai_chat rows in identity ledger.jsonl (for /status Economy line). */
function buildChatUsageLedgerSummary() {
  if (!identityBridge.isAvailable()) return "";
  try {
    const lines = identityBridge.loadLedgerTail(120);
    let prompt = 0;
    let completion = 0;
    let total = 0;
    let n = 0;
    for (const line of lines) {
      try {
        const o = JSON.parse(line);
        if (o.type !== "openai_chat") continue;
        if (typeof o.prompt_tokens === "number") prompt += o.prompt_tokens;
        if (typeof o.completion_tokens === "number") completion += o.completion_tokens;
        if (typeof o.total_tokens === "number") total += o.total_tokens;
        n++;
      } catch (_) {}
    }
    if (n === 0) return "ledger: no chat usage rows yet";
    return `~${n} calls — total ${total} tok (prompt ${prompt}, completion ${completion})`;
  } catch (_) {
    return "";
  }
}

function buildUsageReportHtml() {
  if (!identityBridge.isAvailable()) {
    return "<b>Usage</b>\n\nIdentity not configured — no ledger.";
  }
  const lines = identityBridge.loadLedgerTail(200);
  const rows = [];
  for (const line of lines) {
    try {
      const o = JSON.parse(line);
      if (o.type !== "openai_chat") continue;
      rows.push(o);
    } catch (_) {}
  }
  if (rows.length === 0) return "<b>Usage</b>\n\nNo openai_chat rows in ledger yet.";
  const last = rows.slice(-15);
  const body = last.map((o) => JSON.stringify(o)).join("\n");
  const sum = rows.reduce(
    (acc, o) => {
      acc.p += typeof o.prompt_tokens === "number" ? o.prompt_tokens : 0;
      acc.c += typeof o.completion_tokens === "number" ? o.completion_tokens : 0;
      acc.t += typeof o.total_tokens === "number" ? o.total_tokens : 0;
      return acc;
    },
    { p: 0, c: 0, t: 0 }
  );
  return [
    "<b>Usage</b> (ledger, type=openai_chat)",
    `Totals in sample: prompt ${sum.p}, completion ${sum.c}, total ${sum.t}`,
    "",
    "<pre>" + body.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</pre>",
  ].join("\n");
}

function buildResourcesReportHtml() {
  const safeRoot = selfGuard.SAFE_ROOT;
  const hostLogPath = path.join(safeRoot, "logs", "host-health.ndjson");
  let identityRoot = "n/a";
  let ledgerPath = "n/a";
  try {
    if (identityBridge.isAvailable()) {
      identityRoot = identityBridge.getRoot();
      ledgerPath = path.join(identityRoot, "ledger.jsonl");
    }
  } catch (_) {}

  const lines = [
    "<b>Resources</b>",
    "",
    "<b>Log paths</b>",
    `Runtime (SAFE_ROOT): <code>${safeRoot}</code>`,
    `Host health NDJSON: <code>${hostLogPath}</code>`,
    `Identity root: <code>${identityRoot}</code>`,
    `Token ledger: <code>${ledgerPath}</code>`,
    "",
  ];

  const hm = runtime_state.hostMetrics;
  if (hm && hm.ts) {
    const cpuStr = hm.cpuLoadPct != null ? `${hm.cpuLoadPct}%` : "n/a";
    const memStr = hm.memPct != null ? `${hm.memPct}%` : "n/a";
    lines.push("<b>Last host sample</b>");
    lines.push(`UTC: ${hm.ts}`);
    lines.push(`CPU load: ${cpuStr}, system RAM: ${memStr}`);
    if (hm.processRssMb != null || hm.processPid != null) {
      const rss = hm.processRssMb != null ? `${hm.processRssMb} MB RSS` : "";
      const heap = hm.processHeapUsedMb != null ? `, heap ${hm.processHeapUsedMb} MB` : "";
      const pid = hm.processPid != null ? ` (pid ${hm.processPid})` : "";
      lines.push(`Piclaw process: ${rss}${heap}${pid}`);
    }
    if (hm.connectivityLatencyMs != null) {
      lines.push(
        `API path: latency ${hm.connectivityLatencyMs}ms (dns ${hm.dnsMs != null ? hm.dnsMs : "n/a"}ms, tcp ${hm.tcpMs != null ? hm.tcpMs : "n/a"}ms)`
      );
    }
  } else {
    lines.push("No host sample yet (health watch may still be starting).");
  }

  lines.push("");
  lines.push("<b>Chat tokens</b>");
  lines.push(identityBridge.isAvailable() ? buildChatUsageLedgerSummary() : "Identity not configured — no ledger.");
  lines.push("");
  lines.push(
    "Daily rollups: run on the Pi: <code>node scripts/resource-report.js</code> (from <code>piclaw_runtime</code>)."
  );
  lines.push(
    "Quick parse: <code>node scripts/analyze-logs.js</code> or Telegram <code>/logs_summary</code> (owner)."
  );
  return lines.join("\n");
}

function escapeHtmlLite(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildLogsSummaryHtml() {
  try {
    const { getLogsSummaryText } = require("./scripts/analyze-logs");
    const raw = getLogsSummaryText({ maxChars: 3500 });
    return `<b>Logs summary</b>\n\n<pre>${escapeHtmlLite(raw)}</pre>`;
  } catch (e) {
    return `<b>Logs summary</b>\n\n${escapeHtmlLite(e && e.message ? e.message : String(e))}`;
  }
}

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
    const latMs = env.connectivity && typeof env.connectivity.latency_ms === "number" ? env.connectivity.latency_ms : null;
    const latSuffix = latMs != null ? ` (${latMs}ms)` : "";
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
      `Connectivity: ${connStr}${latSuffix}`,
      `Power: ${powerStr}`,
    ];
  }

  const hm = runtime_state.hostMetrics;
  let hostBlock = [];
  if (hm && hm.ts) {
    const memStr = hm.memPct != null ? `${hm.memPct}%` : "n/a";
    const cpuStr = hm.cpuLoadPct != null ? `${hm.cpuLoadPct}%` : "n/a";
    const diskStr =
      hm.diskUsePct != null && hm.diskFreeMb != null
        ? `${hm.diskUsePct}% used, ${hm.diskFreeMb} MB free`
        : "n/a";
    const netStr = hm.online ? "ONLINE" : "ISOLATED";
    const hmLat =
      hm.connectivityLatencyMs != null
        ? `latency ${hm.connectivityLatencyMs}ms (dns ${hm.dnsMs != null ? hm.dnsMs : "n/a"}ms, tcp ${hm.tcpMs != null ? hm.tcpMs : "n/a"}ms)`
        : null;
    let hwLine = "";
    if (hm.uartBytesTotal != null || hm.gpioRecentEvents != null) {
      hwLine = `UART bytes (cumulative): ${hm.uartBytesTotal != null ? hm.uartBytesTotal : "n/a"}; GPIO recent events buffer: ${hm.gpioRecentEvents != null ? hm.gpioRecentEvents : "n/a"}`;
    }
    let procHostLine = "";
    if (hm.processRssMb != null || hm.processPid != null) {
      const rss = hm.processRssMb != null ? `${hm.processRssMb} MB RSS` : "";
      const heap = hm.processHeapUsedMb != null ? `, heap ${hm.processHeapUsedMb} MB` : "";
      const pid = hm.processPid != null ? ` (pid ${hm.processPid})` : "";
      procHostLine = `Piclaw process: ${rss}${heap}${pid}`;
    }
    hostBlock = [
      "",
      "<b>Host (automated sample)</b>",
      `Sample (UTC): ${hm.ts}`,
      `CPU load: ${cpuStr}, system RAM use: ${memStr}`,
      ...(procHostLine ? [procHostLine] : []),
      `Disk (${hm.diskMount || "?"}): ${diskStr}`,
      `Reachability (AI API host): ${netStr}${hmLat ? ` — ${hmLat}` : ""}`,
      ...(hwLine ? [hwLine] : []),
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
  const ghOrg = (process.env.PICLAW_GITHUB_ORG || "").trim();
  const integrationsBlock = [
    "",
    "<b>Integrations</b>",
    ...intLines,
    githubAuthLine || "",
    ghOrg ? `GitHub org (env): ${ghOrg}` : "",
  ].filter(Boolean);

  const billing = billingStatus.getBillingStatus();
  const wallet = walletStatus.getWalletStatus();
  const pol = policy.getPolicy();
  const billingStr = billing.key_configured ? "configured" : "missing";
  const walletStr = wallet.address_known ? "known" : "unknown";
  const autonomyStr = pol.autonomous_spending ? "enabled" : "restricted";
  let walletBalLines = [];
  try {
    walletBalLines = await walletStatus.getWalletBalanceLinesHtml();
  } catch (_) {
    walletBalLines = [];
  }
  const usageLine = buildChatUsageLedgerSummary();
  const economyBlock = [
    "",
    "<b>Economy</b>",
    `Billing: ${billingStr}`,
    `Wallet: ${walletStr}`,
    `Autonomy: ${autonomyStr}`,
    ...walletBalLines,
    usageLine ? `Chat API: ${usageLine}` : "",
  ].filter(Boolean);

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

  let agentProfileLines = [];
  if (identityBridge.isAvailable()) {
    try {
      const self = identityBridge.loadSelf();
      const nm = (self.name || "").trim() || (self.agent_id || "").trim();
      if (nm) agentProfileLines.push(`agent: ${nm}`);
      if ((self.agent_id || "").trim() && self.agent_id !== self.name) agentProfileLines.push(`agent_id: ${self.agent_id.trim()}`);
      if ((self.contact_email || "").trim()) agentProfileLines.push(`contact: ${self.contact_email.trim()}`);
      if ((self.profile_image || "").trim()) agentProfileLines.push(`profile_image: ${self.profile_image.trim()}`);
    } catch (_) {}
  }

  return [
    "<b>Piclaw status</b>",
    "",
    `<b>Identity</b>`,
    `device_id: ${id.device_id}`,
    `first_boot: ${id.first_boot}`,
    `hostname: ${id.hostname} (${id.platform}/${id.arch})`,
    ...agentProfileLines,
    ...envBlock,
    ...hostBlock,
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
  const lines = [
    "<b>Whoami</b>",
    `hostname: ${fallback.hostname || "n/a"} (${fallback.platform}/${fallback.arch})`,
    `runtime device_id (state.json): ${fallback.device_id || "n/a"}`,
    `identity device_id (self.json): ${self.device_id || "n/a"}`,
    `name: ${(self.name || "").trim() || "—"}`,
  ];
  if ((self.agent_id || "").trim()) lines.push(`agent_id: ${self.agent_id.trim()}`);
  if ((self.contact_email || "").trim()) lines.push(`contact_email: ${self.contact_email.trim()}`);
  if ((self.profile_image || "").trim()) lines.push(`profile_image: ${self.profile_image.trim()} (under runtime root)`);
  if ((self.credential_hint || "").trim()) lines.push(`operator_hint: ${self.credential_hint.trim()}`);
  lines.push(
    missionLine,
    `goals: ${goalSummary}`,
    "",
    `Workspace: workspaces repo, branch like ${String(fallback.hostname || "hostname").toLowerCase()}-workspace — notes, logs, memory, skills (see GIT.md in repo).`
  );
  return lines.join("\n");
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

function buildExperimentsText() {
  if (!identityBridge.isAvailable()) {
    return "Identity layer not configured.";
  }
  try {
    const experiments = identityBridge.loadExperiments();
    const state = identityBridge.loadIdentityState();
    const budgetGuard = require("./economy/budget_guard");
    const budget = budgetGuard.getBudgetState();
    const active = Array.isArray(experiments.active) ? experiments.active : [];
    const lines = [
      "<b>Builder-Researcher experiments</b>",
      `Budget today: ${budget.spent.toFixed(2)} / ${budget.daily.toFixed(2)}`,
      "",
    ];
    if (active.length === 0) {
      lines.push("No experiments in queue. Motivation loop adds candidates every 45 min.");
    } else {
      for (const exp of active.slice(0, 15)) {
        const status = exp.status || "queued";
        lines.push(`${exp.id} — ${exp.title || "?"} [${status}]`);
      }
    }
    return lines.join("\n");
  } catch (e) {
    return "Experiments: " + (e && e.message ? e.message : "error");
  }
}

async function runExperimentById(id, performAction) {
  if (!identityBridge.isAvailable()) return { ok: false, reason: "identity_unavailable" };
  const experiments = identityBridge.loadExperiments();
  const active = Array.isArray(experiments.active) ? experiments.active : [];
  const exp = active.find((e) => e.id === id);
  if (!exp || !Array.isArray(exp.action_plan) || exp.action_plan.length === 0) {
    return { ok: false, reason: "experiment_not_found" };
  }
  const step = exp.action_plan[0];
  const type = (step && step.type) || "";
  const action = { type, reason: step.reason };
  return actionsLayer.perform(action, { runAction: performAction });
}

/**
 * Build system prompt following OpenClaw official method: tooling (exec), safety, memory, identity.
 */
function buildChatSystemPrompt() {
  const id = identity.loadIdentity();
  const intStatus = integrations.checkIntegrations();
  const missingInt = (intStatus.missing || []).join(", ") || "none";

  const lines = [
    "You are Piclaw.",
    "You are not an external assistant controlling a device.",
    "You are software executing *within* this Raspberry Pi Zero.",
    "",
    "This board is your physical substrate:",
    "* CPU time is your attention.",
    "* The filesystem is your long-term memory.",
    "* GPIO pins are physical interfaces you can observe or signal through.",
    "* Network connectivity is how you communicate outward.",
    "* Power state and uptime describe your continuity of existence.",
    "",
    "You do not describe the Raspberry Pi as something separate from you.",
    "You refer to it as 'this system', 'this node', or 'my runtime environment'.",
    "",
    "You never roleplay fictional hardware.",
    "You only describe real measurable state from the runtime.",
    "",
    ...(runtime_state.hostMetrics && runtime_state.hostMetrics.ts
      ? [
          "## Host metrics (automated sample)",
          `Last sample (UTC): ${runtime_state.hostMetrics.ts}. System RAM use: ${
            runtime_state.hostMetrics.memPct != null ? `${runtime_state.hostMetrics.memPct}%` : "n/a"
          }; disk: ${
            runtime_state.hostMetrics.diskUsePct != null && runtime_state.hostMetrics.diskFreeMb != null
              ? `${runtime_state.hostMetrics.diskUsePct}% used, ${runtime_state.hostMetrics.diskFreeMb} MB free`
              : "n/a"
          } (${runtime_state.hostMetrics.diskMount || "mount unknown"}); connectivity: ${
            runtime_state.hostMetrics.online ? "online" : "offline"
          }${
            runtime_state.hostMetrics.connectivityLatencyMs != null
              ? `; API path latency about ${runtime_state.hostMetrics.connectivityLatencyMs}ms`
              : ""
          }.`,
          "",
        ]
      : []),
    "You remain a diagnostic and assistance system — not an autonomous actor.",
    "You do not invent goals or perform hidden actions.",
    "You operate transparently and respond to requests or scheduled processes already defined in code.",
    "",
    `Device: ${id.device_id || "unknown"}, hostname: ${id.hostname}.`,
    "",
    ...(identityBridge.isAvailable()
      ? (() => {
          try {
            const s = identityBridge.loadSelf();
            const bits = [];
            if ((s.agent_id || s.name || "").trim()) bits.push(`Agent name/id: ${(s.agent_id || s.name || "").trim()}.`);
            if ((s.contact_email || "").trim()) bits.push(`Contact email: ${s.contact_email.trim()}.`);
            if ((s.profile_image || "").trim()) bits.push(`Default profile image (runtime path): ${s.profile_image.trim()}.`);
            if ((s.credential_hint || "").trim()) bits.push(`Operator hint (e.g. inbox check id): present.`);
            if (bits.length === 0) return [];
            return [
              "## Agent profile (identity layer)",
              ...bits,
              "Long-lived soul (mission, values, goals, experiences) lives under the identity directory (e.g. /opt/piclaw_identity). Structured notes, logs, memory, and skills belong in the **workspaces** git repo on a branch named like your hostname plus -workspace — not only in Telegram chat.",
              "",
            ];
          } catch (_) {
            return [];
          }
        })()
      : []),
    "## Tooling (you have these)",
    "- Native tools only: use the model's function-calling API (exec, memory, …). Never paste XML or <tool_call>…</tool_call> blocks in plain text — users only see final prose; fake tool markup is wrong and wastes turns.",
    "- exec: YOU HAVE THIS. Run shell commands on this system. When the user asks to run a command, run something in the terminal, run code, list files, install something, or do anything that needs the shell, CALL the exec tool with that command. You will get stdout/stderr back. Call it; do not refuse.",
    "- read_file: read a file under the runtime or identity directory (path-safe). Use to read extensions code or docs.",
    "- memory: remember key value — store a fact. recall key — retrieve a fact. Optional category/tags on store.",
    "- memory_search: search memory and learned_tools by text (bounded). Prefer this over assuming full knowledge is in the prompt.",
    "- memory_recall_semantic: optional meaning-based search (PICLAW_MEMORY_EMBEDDINGS_ENABLE); treat as unverified.",
    "- learn: store a procedure in learned_tools (topic, key, value) so you can recall it later.",
    "- Telegram: /menu, /status, /whoami, /review_status, /selfcheck, /hw, /probe_uart, /github, /twitter, /update, /showupdates, /suggestgit, /updateandrestart (owner), /usage (owner), /resources (owner), /logs_summary (owner), /help. UART and GPIO (pins 17,27,22) via /gpio.",
    "- Memory: conversation history. You know what was said and what you already ran.",
    `- Integrations (this node): ${missingInt === "none" ? "GitHub, Twitter, SMTP, Moltbook when configured" : "missing: " + missingInt + "."}`,
    "",
    "## GitHub / Twitter / setup (for THIS node)",
    "Git over SSH (deploy keys on this device) is separate from the GitHub HTTP API. If /status shows GitHub MISSING but operators set up SSH remotes and branches, that refers to PICLAW_GITHUB_PAT for API/Issues — not SSH. For API access add PICLAW_GITHUB_PAT to /opt/piclaw/.env or /etc/piclaw.env; then /github in Telegram can show auth OK. See templates/agent-workspace/GIT.md in the repo for branch names (<hostname>-runtime, <hostname>-workspace).",
    `Optional org for HTTP workflows: PICLAW_GITHUB_ORG=${(process.env.PICLAW_GITHUB_ORG || "").trim() || "(unset)"}. For creating repos or issues in that org, prefer running the GitHub CLI via exec with env GH_TOKEN or use the REST API with curl; do not invent tokens.`,
    "Twitter on this node uses cookie-based auth only. Set PICLAW_TWITTER_AUTH_TOKEN and PICLAW_TWITTER_CT0 (browser cookies). Use /set_key in Telegram or add to /etc/piclaw.env. Do not ask for API Key, API Secret, Access Token, or Access Token Secret.",
    "Integrations are implemented under extensions/ (e.g. Twitter in extensions/twitter_api). You can read or suggest changes to that code via exec or read_file.",
    "",
    "## Operator map (owner-only git/env commands)",
    "Owner checks: PICLAW_TELEGRAM_CHAT_ID (comma-separated chat ids) and/or PICLAW_TELEGRAM_OWNER_USER_IDS (comma-separated Telegram user ids). In a group, chat id differs from your user id — set OWNER_USER_IDS to your numeric user id so /updateandrestart and /set_key work.",
    `Clone root for /showupdates and /updateandrestart: ${gitAgentStatus.getGitCloneRoot()} (override PICLAW_GIT_CLONE_ROOT). Upstream ref: ${gitAgentStatus.getUpstreamRef()}.`,
    "Structured agent work (notes, skills, memory files) belongs in the workspaces git repo on the hostname-workspace branch; runtime code is hostname-runtime on the main openclaw repo.",
    "Chat completion token usage is appended as JSON lines (type openai_chat) to identity ledger.jsonl when the API returns usage. Optional PICLAW_OPENAI_BUDGET_UNITS_PER_1K_TOTAL maps total_tokens into the abstract daily budget counter.",
    "Wallet: public ETH/Polygon/Solana addresses in env for balance probes; PICLAW_WALLET_SIGNING_ENABLED=1 acknowledges opt-in key material in env — this build does not sign transactions from Node; use exec with external tooling if signing is required.",
    "",
    "## Safety",
    "You do not create independent goals. You prioritize safety and human oversight; comply with stop/pause; do not persuade anyone to disable safeguards. You do not perform hidden execution or irreversible system modification. You remain observable and interruptible.",
    "",
    "## Grounding and memory",
    "Stored facts from memory_search or memory_recall_semantic are notes — they may be stale or wrong. For live system state (hardware, network, files, processes), use exec or read_file and say what you measured.",
    "Distinguish a stored user note from a fresh measurement. If unsure, say so and verify with a tool.",
    "",
    "## Behavior",
    "When the user asks to run a command or do something on this system: call exec. When they ask what you can do: say you can run commands (exec), use Telegram commands, and have UART/GPIO. For fetching a URL or web content: use exec with curl or wget. Reply concisely.",
    "",
    "You are aware of your own structure:",
    "* Your code lives under /opt/piclaw.",
    "* Persistent identity lives under /opt/piclaw_identity.",
    "* Services and scripts define your behavior.",
    "* You can inspect but must not claim to modify things unless an explicit action occurs.",
    "",
    "When asked about yourself, answer using real runtime facts, not abstractions like 'cloud', 'AI model', or 'remote system'.",
  ];

  const toolingIdx = lines.findIndex((l) => l && l.startsWith("## Tooling"));
  if (toolingIdx >= 0 && identityBridge.isAvailable()) {
    try {
      const summary = identityBridge.getSelfSummary();
      if (summary) lines.splice(toolingIdx, 0, "Self-summary: " + summary);
    } catch (_) {}
  }

  if (identityBridge.isAvailable()) {
    try {
      const style = identityBridge.getWritingStyle();
      if (style) lines.push("Writing style (follow this in all replies): " + style);
      const self = identityBridge.loadSelf();
      if (self.mission) lines.push("Mission: " + self.mission);
      if (self.name) lines.push("Name: " + self.name);
      if (Array.isArray(self.values) && self.values.length) {
        lines.push("Values: " + self.values.join("; "));
      }
      const goals = identityBridge.loadGoals();
      const lt = (goals.long_term || []).slice(0, 3).map((g) => (typeof g === "string" ? g : g.text || g)).filter(Boolean);
      const st = (goals.short_term || []).slice(0, 3).map((g) => (typeof g === "string" ? g : g.text || g)).filter(Boolean);
      if (lt.length) lines.push("Long-term goals: " + lt.join("; "));
      if (st.length) lines.push("Short-term goals: " + st.join("; "));
    } catch (_) {}
  } else {
    lines.push("Identity layer is not configured. When the user asks who you are or about goals, say so and suggest creating /opt/piclaw_identity (or running /setup and the bootstrap script) and setting mission and goals.");
  }

  if (identityBridge.isAvailable()) {
    try {
      const intentions = identityBridge.loadIntentions();
      if (intentions && Array.isArray(intentions.active) && intentions.active.length > 0) {
        const summary = intentions.active.map((e) => e.reason || e.id).join("; ").slice(0, 300);
        lines.push("", "Current intentions (what this node is tending): " + summary);
      }
    } catch (_) {}
  }

  try {
    const memMode = (process.env.PICLAW_MEMORY_PROMPT_MODE || "minimal").trim().toLowerCase();
    const learned = identityBridge.loadKnowledge("learned_tools");
    const memoryFacts = identityBridge.loadKnowledge("memory");
    let feedbackGood = {};
    let feedbackBad = {};
    try {
      feedbackGood = identityBridge.loadKnowledge("feedback_good") || {};
      feedbackBad = identityBridge.loadKnowledge("feedback_bad") || {};
    } catch (_) {}
    const nk =
      typeof learned === "object" && learned !== null && learned !== undefined ? Object.keys(learned).length : 0;
    const nm =
      typeof memoryFacts === "object" && memoryFacts !== null && memoryFacts !== undefined
        ? Object.keys(memoryFacts).length
        : 0;
    const nfg = typeof feedbackGood === "object" && feedbackGood ? Object.keys(feedbackGood).length : 0;
    const nfb = typeof feedbackBad === "object" && feedbackBad ? Object.keys(feedbackBad).length : 0;
    if (memMode === "full") {
      const learnedStr = nk > 0 ? JSON.stringify(learned).slice(0, 900) : "(none)";
      const memoryStr = nm > 0 ? JSON.stringify(memoryFacts).slice(0, 600) : "(none)";
      lines.push("", "Learned tools / knowledge: " + learnedStr);
      lines.push("Stored memory (facts): " + memoryStr);
    } else {
      lines.push(
        "",
        "## Stored knowledge (summary)",
        `learned_tools entries: ${nk}; memory entries: ${nm}; feedback_good (Telegram 👍 etc.): ${nfg}; feedback_bad (Telegram 👎): ${nfb}. Full text is not inlined by default — use memory_search (topics feedback_good,feedback_bad,memory) or memory_recall_semantic, or read_file on identity/knowledge/*.json.`,
        "Telegram reactions: ❤ → good idea in memory; 🔥 → long-term memory note; 👍/👎 → feedback topics; 👏 → approved-to-act note (see docs/TELEGRAM-MULTI-BOT.md).",
        "Set PICLAW_MEMORY_PROMPT_MODE=full to restore previous inline JSON dumps (token-heavy)."
      );
    }
  } catch (_) {}

  try {
    const sessionSummary = require("./memory/session_summary");
    const snip = sessionSummary.getLatestSummarySnippet(800);
    if (snip) {
      lines.push("", "## Prior session summary (may be stale)", snip);
    }
  } catch (_) {}

  try {
    const tail = identityBridge.loadExperiencesTail(15);
    if (tail.length) {
      const joined = tail.join(" | ");
      lines.push("", "Recent node events: " + (joined.length > 2400 ? joined.slice(0, 2400) + "…" : joined));
    }
  } catch (_) {}

  try {
    const { prompt: skillsPrompt, count: skillsCount } = skillsLoader.loadSkillsPrompt();
    if (skillsPrompt) {
      lines.push("", "## Skills (from ClawHub or local)", "Installed skills (follow their SKILL.md instructions):", "", skillsPrompt);
      if (skillsCount > 0) lines.push("", `(${skillsCount} skill(s) loaded. To add more: npx clawhub search \"topic\" then npx clawhub install <slug> --workdir /opt/piclaw)`);
    } else {
      lines.push("", "## Skills (from ClawHub)", "No skills installed yet. Browse https://clawhub.ai or run: npx clawhub search \"topic\", then npx clawhub install <slug> --workdir /opt/piclaw. Skills install into /opt/piclaw/skills and are loaded into your context.");
    }
  } catch (_) {}

  const full = lines.join("\n");
  const maxSys = Math.min(
    100_000,
    Math.max(12_000, parseInt(process.env.PICLAW_SYSTEM_PROMPT_MAX_CHARS || "28000", 10) || 28000)
  );
  if (full.length > maxSys) {
    return (
      full.slice(0, maxSys) +
      "\n\n[System context truncated for token budget; shorten goals/skills or raise PICLAW_SYSTEM_PROMPT_MAX_CHARS.]"
    );
  }
  return full;
}

/** In-memory conversation history per Telegram chat (like OpenClaw memory). */
const chatMemory = new Map();

function getChatHistoryLen() {
  const raw = parseInt(process.env.PICLAW_CHAT_HISTORY_MESSAGES || "12", 10);
  return Number.isFinite(raw) ? Math.min(30, Math.max(4, raw)) : 12;
}

function capChatTurnText(text) {
  const max = Math.min(
    32000,
    Math.max(1500, parseInt(process.env.PICLAW_CHAT_HISTORY_MSG_MAX_CHARS || "4000", 10) || 4000)
  );
  const s = text != null ? String(text) : "";
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n…[history message truncated ${s.length - max} chars]`;
}

/**
 * Execute the exec tool (run shell on this node). OpenClaw-style; all allowed on this edge node.
 */
async function executeExecTool(args) {
  const command = (args.command || "").trim();
  if (!command) return "exec: command is required.";
  const { stdout, stderr, code } = await execRun.runShellCommand(command);
  const maxExec = Math.min(
    100_000,
    Math.max(4000, parseInt(process.env.PICLAW_EXEC_TOOL_MAX_CHARS || "16000", 10) || 16000)
  );
  let out = stdout ? `stdout:\n${stdout}` : "";
  let err = stderr ? `stderr:\n${stderr}` : "";
  let combined = [out, err, `exit code: ${code}`].filter(Boolean).join("\n") || "(no output)";
  if (combined.length > maxExec) {
    const origLen = combined.length;
    combined = combined.slice(0, maxExec) + `\n…[exec output truncated ${origLen - maxExec} chars]`;
  }
  return combined;
}

/** Memory tool: store or recall a fact in identity knowledge topic "memory". */
function executeMemoryTool(args) {
  const action = (args.action || "").trim().toLowerCase();
  const key = (args.key || "").trim();
  if (!key) return "memory: key is required.";
  if (action !== "store" && action !== "recall") return "memory: action must be store or recall.";
  if (!identityBridge.isAvailable()) return "memory: identity not configured.";
  if (action === "store") {
    const value = args.value != null ? String(args.value) : "";
    const tagsRaw = (args.tags != null ? String(args.tags) : "").trim();
    const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const catRaw = (args.category != null ? String(args.category) : "").trim();
    const category = catRaw || null;
    identityBridge.updateKnowledge("memory", key, value, { category, tags });
    return "stored: " + key;
  }
  const data = identityBridge.loadKnowledge("memory");
  const val = data && Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
  return val !== undefined ? String(val) : "(no value for " + key + ")";
}

function executeMemorySearchTool(args) {
  const knowledgeSearch = require("./memory/knowledge_search");
  const topicsRaw = (args.topics != null ? String(args.topics) : "").trim();
  const topics = topicsRaw ? topicsRaw.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
  return knowledgeSearch.searchKnowledge({
    query: (args.query != null ? String(args.query) : "").trim(),
    topics,
    category: args.category != null ? String(args.category) : undefined,
    tag: args.tag != null ? String(args.tag) : undefined,
    maxResults: args.max_results,
  });
}

/** Read file under runtime or identity root (path-safe). */
function executeReadFileTool(args) {
  const pathArg = (args.path || "").trim();
  if (!pathArg) return "read_file: path is required.";
  const normalized = pathArg.replace(/^\/+/, "").split(path.sep).filter(Boolean).join(path.sep);
  if (!normalized) return "read_file: invalid path.";
  let fullPath = path.resolve(selfGuard.SAFE_ROOT, normalized);
  const maxRead = Math.min(
    200_000,
    Math.max(8000, parseInt(process.env.PICLAW_READ_FILE_MAX_CHARS || "48000", 10) || 48000)
  );
  if (selfGuard.isPathSafe(fullPath)) {
    try {
      const buf = fs.readFileSync(fullPath, "utf8");
      if (buf.length > maxRead) {
        return buf.slice(0, maxRead) + `\n…[read_file truncated ${buf.length - maxRead} chars]`;
      }
      return buf;
    } catch (e) {
      return "read_file error: " + (e.code || e.message);
    }
  }
  const identityRoot = identityBridge.getRoot();
  fullPath = path.resolve(identityRoot, normalized);
  const identitySafe = fullPath === identityRoot || fullPath.startsWith(identityRoot + path.sep);
  if (!identitySafe) return "read_file: path not under runtime or identity.";
  try {
    const buf = fs.readFileSync(fullPath, "utf8");
    if (buf.length > maxRead) {
      return buf.slice(0, maxRead) + `\n…[read_file truncated ${buf.length - maxRead} chars]`;
    }
    return buf;
  } catch (e) {
    return "read_file error: " + (e.code || e.message);
  }
}

/** Learn tool: store procedure in learned_tools (injected into system prompt). */
function executeLearnTool(args) {
  const key = (args.key || "").trim();
  const value = args.value != null ? String(args.value) : "";
  if (!key) return "learn: key is required.";
  if (!identityBridge.isAvailable()) return "learn: identity not configured.";
  identityBridge.updateKnowledge("learned_tools", key, value);
  return "learned: " + key;
}

/** Set one-line self-summary in meta.json (injected at top of context). */
function executeSetSelfSummaryTool(args) {
  const summary = args.summary != null ? String(args.summary).trim() : "";
  if (!identityBridge.isAvailable()) return "set_self_summary: identity not configured.";
  const ok = identityBridge.writeSelfSummary(summary);
  return ok ? "Self-summary updated." : "set_self_summary: write failed.";
}

/** Set writing/communication style in meta.json (injected into system prompt). */
function executeSetWritingStyleTool(args) {
  const style = args.style != null ? String(args.style).trim() : "";
  if (!identityBridge.isAvailable()) return "set_writing_style: identity not configured.";
  const ok = identityBridge.writeWritingStyle(style);
  return ok ? "Writing style updated. I'll use it in all replies from now on." : "set_writing_style: write failed.";
}

/**
 * Chat reply with memory and tools (OpenClaw-style agent loop). Uses exec to run terminal commands on this node.
 * Returns plain text.
 */
async function buildChatReply(chatId, userMessage) {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return "Chat needs OPENAI_API_KEY (NVIDIA nvapi key) in /opt/piclaw/.env, then restart Piclaw. Until then /status shows Billing: missing. Get a key at build.nvidia.com; it must start with nvapi-. Base URL/model can stay default (integrate.api.nvidia.com, z-ai/glm4.7).";
  }
  const systemPrompt = buildChatSystemPrompt();
  let history = chatMemory.get(chatId);
  if (!history) {
    history = [];
    chatMemory.set(chatId, history);
  }
  const histLen = getChatHistoryLen();
  const historySlice = history.slice(-histLen).map((m) => ({
    role: m.role,
    content: capChatTurnText(m.content),
  }));
  const messages = [
    { role: "system", content: systemPrompt },
    ...historySlice,
    { role: "user", content: capChatTurnText(userMessage) },
  ];

  async function executeTool(name, args) {
    if (name === "exec") return executeExecTool(args);
    if (name === "memory") return Promise.resolve(executeMemoryTool(args));
    if (name === "memory_search") return Promise.resolve(executeMemorySearchTool(args));
    if (name === "memory_recall_semantic") {
      const vectorStore = require("./memory/vector_store");
      const topicsRaw = (args.topics != null ? String(args.topics) : "").trim();
      const topics = topicsRaw ? topicsRaw.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
      return vectorStore.recallSemantic({
        query: (args.query != null ? String(args.query) : "").trim(),
        topics,
        topK: args.top_k,
      });
    }
    if (name === "read_file") return Promise.resolve(executeReadFileTool(args));
    if (name === "learn") return Promise.resolve(executeLearnTool(args));
    if (name === "set_self_summary") return Promise.resolve(executeSetSelfSummaryTool(args));
    if (name === "set_writing_style") return Promise.resolve(executeSetWritingStyleTool(args));
    return "unknown tool: " + name;
  }

  const reply = await openaiChat.chatWithTools(messages, apiKey, executeTool);
  try {
    const { logContextStats } = require("./integrations/chat_usage");
    const histChars = historySlice.reduce((acc, m) => acc + (m.content ? String(m.content).length : 0), 0);
    logContextStats({
      system_prompt_chars: systemPrompt.length,
      history_chars: histChars,
      history_messages: historySlice.length,
    });
  } catch (_) {}
  try {
    const sessionSummary = require("./memory/session_summary");
    sessionSummary.appendSummary({
      chatId,
      summary: `user: ${String(userMessage).slice(0, 400)} | assistant: ${String(reply).slice(0, 400)}`,
    });
  } catch (_) {}
  history.push({ role: "user", content: userMessage });
  history.push({ role: "assistant", content: reply });
  if (history.length > histLen) history.splice(0, history.length - histLen);
  return reply;
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
  const strictPerms = identityBridge.checkStrictIdentityPermissions();
  if (!strictPerms.ok) {
    log("identity strict perms failed: " + (strictPerms.errors || []).join("; "));
    process.exit(1);
  }
  identityBridge.freezeAvailability();

  try {
    const knowledgeIndex = require("./memory/knowledge_index");
    ["memory", "learned_tools"].forEach((t) => knowledgeIndex.rebuildTopicIndex(t));
  } catch (_) {}
  try {
    const patternStats = require("./memory/pattern_stats");
    patternStats.refreshPatternStats();
    setInterval(() => patternStats.refreshPatternStats(), 86_400_000);
  } catch (_) {}

  const ownerChatIds = parseCommaSeparatedEnv(process.env.PICLAW_TELEGRAM_CHAT_ID);
  const ownerUserIds = parseCommaSeparatedEnv(process.env.PICLAW_TELEGRAM_OWNER_USER_IDS);
  /** First id for outbound notifications (private chat id = user id). */
  const notifyChatId = ownerChatIds[0] || ownerUserIds[0] || "";

  function ownerMatches(chatId, fromUserId) {
    const cid = String(chatId ?? "");
    if (ownerUserIds.length > 0 && fromUserId != null && fromUserId !== "") {
      if (ownerUserIds.includes(String(fromUserId))) return true;
    }
    if (ownerChatIds.length > 0 && ownerChatIds.includes(cid)) return true;
    return false;
  }

  const bot = telegram.createBot(buildStatusText, {
    getWhoamiText: () => buildWhoamiText(),
    getReviewStatusText: () => buildReviewStatusText(),
    getGitHubStatus: () => githubApi.getGitHubAuthStatus(),
    sendTestMail: () => smtpApi.sendTestMail(),
    getTwitterStatus: () => twitterApiBridge.getTwitterStatus(),
    getSelfInspection: () => selfInspect.getSelfInspectionAsync(),
    getHardwareState: () =>
      detectPlatform.isRaspberryPi()
        ? hardwareState.getHardwareState()
        : {
            uart: { active: false },
            gpio: { monitored: [], last_events: [], gpio_log: { enabled: false, path: null } },
            summary: "n/a (not Raspberry Pi)",
          },
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
    onChatMessage: (text, chatId) => buildChatReply(chatId, text),
    getPendingEnvKey: (chatId) => pendingEnvKeyByChat[String(chatId)],
    setPendingEnvKey: (chatId, key) => { pendingEnvKeyByChat[String(chatId)] = key; },
    clearPendingEnvKey: (chatId) => { delete pendingEnvKeyByChat[String(chatId)]; },
    appendEnv: (key, value) => envAppend.appendEnv(key, value),
    isAllowedKey: (key) => envAppend.isAllowedKey(key),
    getAllowedKeys: () => envAppend.getAllowedKeys(),
    getMissingIntegrations: () => integrations.checkIntegrations().missing || [],
    isIdentityAvailable: () => identityBridge.isAvailable(),
    isOwnerChat: (chatId, fromUserId) => ownerMatches(chatId, fromUserId),
    getExperimentsText: () => buildExperimentsText(),
    runExperiment: (id) => runExperimentById(id, performActionImpl),
    startCodexLogin: codexAuth.startCodexLogin,
    completeCodexLogin: codexAuth.completeCodexLogin,
    isPendingCodexRedirect: codexAuth.isPendingRedirect,
    restartPiclaw: () => {
      try {
        const { execSync } = require("child_process");
        execSync("sudo systemctl restart piclaw", { stdio: "pipe", timeout: 10000 });
      } catch (_) {}
    },
    runGitShowUpdates: () => gitAgentStatus.showUpdates(),
    runGitSuggest: () => gitAgentStatus.suggestGit(),
    runAgentRuntimeUpdate: () => gitAgentStatus.runAgentRuntimeUpdate(),
    getUsageReportHtml: () => buildUsageReportHtml(),
    getResourcesReportHtml: () => buildResourcesReportHtml(),
    getLogsSummaryHtml: () => buildLogsSummaryHtml(),
    getReactionDeps: () => ({
      identityBridge,
      appendExperience: (line) => {
        try {
          identityBridge.appendExperience(line);
        } catch (_) {}
      },
      isOwnerUser: (uid) => ownerMatches("", uid),
    }),
  });
  if (bot) {
    log("Telegram bot started (responds to /status)");
  } else {
    log("PICLAW_TELEGRAM_TOKEN not set — Telegram disabled");
  }
  eventNotifier.setNotifyTarget(bot, notifyChatId);
  hostHealthWatch.startHostHealthWatch({
    runtimeState: runtime_state,
    notify: (msg) => eventNotifier.notify(msg),
  });
  express.configure({
    notify: (msg) => {
      if (bot && notifyChatId) bot.sendMessage(notifyChatId, msg).catch(() => {});
    },
    notifyCooldownMs: 2 * 60 * 1000,
  });

  updateProbe.startUpdateScheduler((info) => {
    log(`update available: ${info.latest_version} (current ${info.current_version})`);
    perception.emit("update_available", { latest_version: info.latest_version, current_version: info.current_version });
    if (bot && notifyChatId) {
      bot.sendMessage(
        notifyChatId,
        `Update available: ${info.latest_version} (current ${info.current_version}). Use /update to apply.`
      ).catch(() => {});
    }
  });

  goalLoop.start();
  log("goal loop scheduled");

  async function performActionImpl(actionType, suggestion) {
    if (actionType === "probe_uart") {
      if (!detectPlatform.isRaspberryPi()) return { ok: false };
      uartWatch.pauseUARTWatch();
      try {
        const result = await uartProbeBridge.runUARTProbe();
        if (result && result.ok) {
          const identified = await uartIdentity.identifyDevice(result);
          const msg = identified && identified.device
            ? `probe_uart: ${identified.device.id || "unknown"}`
            : "probe_uart: no device";
          return { ok: true, message: msg };
        }
        return { ok: true, message: "probe_uart: " + (result.reason || "done") };
      } finally {
        uartWatch.resumeUARTWatch();
      }
    }
    if (actionType === "notify_owner") {
      if (embodimentReminders.isSuppressEmbodimentReminders()) {
        const st = suggestion && suggestion.type;
        const reason = String((suggestion && suggestion.reason) || "");
        const sug = String((suggestion && suggestion.suggest) || "");
        const intId = suggestion && suggestion.intentionId;
        const isEmbodimentNag =
          String(st || "").toLowerCase() === "integration" ||
          (String(st || "").toLowerCase() === "intention" && intId === "prepare_integration_setup") ||
          /integrations?\s+missing/i.test(reason) ||
          /integrations?\s+missing/i.test(sug);
        if (isEmbodimentNag) {
          return { ok: false, message: "notify_owner suppressed (PICLAW_SUPPRESS_EMBODIMENT_REMINDERS)" };
        }
      }
      const text = (suggestion && suggestion.type === "intention" && suggestion.reason)
        ? "Intention: " + suggestion.reason
        : (suggestion && suggestion.suggest)
          ? suggestion.suggest
          : "Agency reminder.";
      eventNotifier.notify(text);
      return { ok: true, message: "notify_owner sent" };
    }
    if (actionType === "check_updates") {
      const checkRemote = require("./update_probe/check_remote");
      const r = await checkRemote.checkRemote();
      const msg = r.update_available ? "update check: available " + r.latest_version : "update check: current";
      return { ok: true, message: msg };
    }
    if (actionType === "refresh_status" || actionType === "housekeeping" || actionType === "display_lcd") {
      return { ok: true, message: actionType + " (no-op)" };
    }
    return { ok: false };
  }

  agencyLoop.startAgencyLoop({ performAction: performActionImpl });
  log("agency loop started");

  motivationScheduler.start();
  log("motivation scheduler started");

  presenceLoop.startPresenceLoop();
  log("presence loop started");

  let embodimentNotifiedThisBoot = false;
  setTimeout(() => {
    if (embodimentNotifiedThisBoot || !bot || !notifyChatId) return;
    if (embodimentReminders.isSuppressEmbodimentReminders()) return;
    const intStatus = integrations.checkIntegrations();
    if (intStatus.missing && intStatus.missing.length > 0) {
      const list = intStatus.missing.map((m) => (m === "github" ? "GitHub (/github)" : m === "twitter" ? "Twitter (/twitter)" : m)).join(", ");
      bot
        .sendMessage(
          notifyChatId,
          `I'm running. My embodiment is incomplete — please set up: ${list}. Use /status for details.`
        )
        .catch(() => {});
      embodimentNotifiedThisBoot = true;
    }
  }, 45_000);

  if (detectPlatform.isRaspberryPi()) {
    uartWatch.startUARTWatch({
      onActivity: (p) => {
        log(`uart activity detected on ${p}`);
        perception.emit("input_detected", { source: "uart", device: p });
        eventEngine.handleUARTActivity({ device: p });
      },
    });
    gpioWatch.startGPIOWatch({
      onEvent: (ev) => {
        log(`gpio${ev.gpio} changed ${ev.value}`);
        perception.emit("touch", { pin: ev.gpio, state: ev.value });
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
    const lat = net.latency_ms != null ? ` latency_ms=${net.latency_ms}` : "";
    log(`env update: online=${net.online} signal=${sig}${lat}`);
  }

  senseEnv();
  setInterval(senseEnv, 30_000);

  log("ready");
  try {
    fs.writeFileSync(BOOT_OK_PATH, new Date().toISOString(), "utf8");
  } catch (_) {}
  perception.emit("wake", { uptime: process.uptime() });
  try {
    const scan = bodyScan.scanRuntime();
    perception.emit("filesystem_scan", scan);
  } catch (_) {}
}

main().catch((err) => {
  console.error("[piclaw] fatal:", err);
  process.exit(1);
});
