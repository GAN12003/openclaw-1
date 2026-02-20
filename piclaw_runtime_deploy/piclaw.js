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

const runtime_state = { environment: null };
const pendingEnvKeyByChat = {};

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
    "You remain a diagnostic and assistance system — not an autonomous actor.",
    "You do not invent goals or perform hidden actions.",
    "You operate transparently and respond to requests or scheduled processes already defined in code.",
    "",
    `Device: ${id.device_id || "unknown"}, hostname: ${id.hostname}.`,
    "",
    "## Tooling (you have these)",
    "- exec: YOU HAVE THIS. Run shell commands on this system. When the user asks to run a command, run something in the terminal, run code, list files, install something, or do anything that needs the shell, CALL the exec tool with that command. You will get stdout/stderr back. Call it; do not refuse.",
    "- read_file: read a file under the runtime or identity directory (path-safe). Use to read extensions code or docs.",
    "- memory: remember key value — store a fact. recall key — retrieve a fact. Use for long-term user preferences or setup notes.",
    "- learn: store a procedure in learned_tools (topic, key, value) so you can recall it later.",
    "- Telegram: /status, /whoami, /review_status, /selfcheck, /hw, /probe_uart, /github, /twitter, /update, /help. UART and GPIO (pins 17,27,22) via /gpio.",
    "- Memory: conversation history. You know what was said and what you already ran.",
    `- Integrations (this node): ${missingInt === "none" ? "GitHub, Twitter, SMTP, Moltbook when configured" : "missing: " + missingInt + "."}`,
    "",
    "## GitHub / Twitter / setup (for THIS node)",
    "Setting up GitHub for this node means: add PICLAW_GITHUB_PAT to /etc/piclaw.env (GitHub → Settings → Developer settings → Personal access token). Then /github in Telegram works. Do not give generic create-a-repo steps unless the user asks for that.",
    "Twitter on this node uses cookie-based auth only. Set PICLAW_TWITTER_AUTH_TOKEN and PICLAW_TWITTER_CT0 (browser cookies). Use /set_key in Telegram or add to /etc/piclaw.env. Do not ask for API Key, API Secret, Access Token, or Access Token Secret.",
    "Integrations are implemented under extensions/ (e.g. Twitter in extensions/twitter_api). You can read or suggest changes to that code via exec or read_file.",
    "",
    "## Safety",
    "You do not create independent goals. You prioritize safety and human oversight; comply with stop/pause; do not persuade anyone to disable safeguards. You do not perform hidden execution or irreversible system modification. You remain observable and interruptible.",
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
    const learned = identityBridge.loadKnowledge("learned_tools");
    const memoryFacts = identityBridge.loadKnowledge("memory");
    const learnedStr = typeof learned === "object" && learned !== null && Object.keys(learned).length > 0
      ? JSON.stringify(learned).slice(0, 1500) : "(none)";
    const memoryStr = typeof memoryFacts === "object" && memoryFacts !== null && Object.keys(memoryFacts).length > 0
      ? JSON.stringify(memoryFacts).slice(0, 1000) : "(none)";
    lines.push("", "Learned tools / knowledge: " + learnedStr);
    lines.push("Stored memory (facts): " + memoryStr);
  } catch (_) {}

  try {
    const tail = identityBridge.loadExperiencesTail(30);
    if (tail.length) lines.push("", "Recent node events: " + tail.join(" | "));
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

  return lines.join("\n");
}

/** In-memory conversation history per Telegram chat (like OpenClaw memory). Last 20 messages. */
const chatMemory = new Map();
const CHAT_HISTORY_LEN = 20;

/**
 * Execute the exec tool (run shell on this node). OpenClaw-style; all allowed on this edge node.
 */
async function executeExecTool(args) {
  const command = (args.command || "").trim();
  if (!command) return "exec: command is required.";
  const { stdout, stderr, code } = await execRun.runShellCommand(command);
  const out = stdout ? `stdout:\n${stdout}` : "";
  const err = stderr ? `stderr:\n${stderr}` : "";
  return [out, err, `exit code: ${code}`].filter(Boolean).join("\n") || "(no output)";
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
    identityBridge.updateKnowledge("memory", key, value);
    return "stored: " + key;
  }
  const data = identityBridge.loadKnowledge("memory");
  const val = data && Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
  return val !== undefined ? String(val) : "(no value for " + key + ")";
}

/** Read file under runtime or identity root (path-safe). */
function executeReadFileTool(args) {
  const pathArg = (args.path || "").trim();
  if (!pathArg) return "read_file: path is required.";
  const normalized = pathArg.replace(/^\/+/, "").split(path.sep).filter(Boolean).join(path.sep);
  if (!normalized) return "read_file: invalid path.";
  let fullPath = path.resolve(selfGuard.SAFE_ROOT, normalized);
  if (selfGuard.isPathSafe(fullPath)) {
    try {
      return fs.readFileSync(fullPath, "utf8");
    } catch (e) {
      return "read_file error: " + (e.code || e.message);
    }
  }
  const identityRoot = identityBridge.getRoot();
  fullPath = path.resolve(identityRoot, normalized);
  const identitySafe = fullPath === identityRoot || fullPath.startsWith(identityRoot + path.sep);
  if (!identitySafe) return "read_file: path not under runtime or identity.";
  try {
    return fs.readFileSync(fullPath, "utf8");
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

/**
 * Chat reply with memory and tools (OpenClaw-style agent loop). Uses exec to run terminal commands on this node.
 * Returns plain text.
 */
async function buildChatReply(chatId, userMessage) {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return "Chat needs OPENAI_API_KEY in .env. I still have my identity and goals — use /whoami or /status.";
  }
  const systemPrompt = buildChatSystemPrompt();
  let history = chatMemory.get(chatId);
  if (!history) {
    history = [];
    chatMemory.set(chatId, history);
  }
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-CHAT_HISTORY_LEN),
    { role: "user", content: userMessage },
  ];

  async function executeTool(name, args) {
    if (name === "exec") return executeExecTool(args);
    if (name === "memory") return Promise.resolve(executeMemoryTool(args));
    if (name === "read_file") return Promise.resolve(executeReadFileTool(args));
    if (name === "learn") return Promise.resolve(executeLearnTool(args));
    if (name === "set_self_summary") return Promise.resolve(executeSetSelfSummaryTool(args));
    return "unknown tool: " + name;
  }

  const reply = await openaiChat.chatWithTools(messages, apiKey, executeTool);
  history.push({ role: "user", content: userMessage });
  history.push({ role: "assistant", content: reply });
  if (history.length > CHAT_HISTORY_LEN) history.splice(0, history.length - CHAT_HISTORY_LEN);
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

  const notifyChatId = (process.env.PICLAW_TELEGRAM_CHAT_ID || "").trim();
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
    onChatMessage: (text, chatId) => buildChatReply(chatId, text),
    getPendingEnvKey: (chatId) => pendingEnvKeyByChat[String(chatId)],
    setPendingEnvKey: (chatId, key) => { pendingEnvKeyByChat[String(chatId)] = key; },
    clearPendingEnvKey: (chatId) => { delete pendingEnvKeyByChat[String(chatId)]; },
    appendEnv: (key, value) => envAppend.appendEnv(key, value),
    isAllowedKey: (key) => envAppend.isAllowedKey(key),
    getAllowedKeys: () => envAppend.getAllowedKeys(),
    getMissingIntegrations: () => integrations.checkIntegrations().missing || [],
    isIdentityAvailable: () => identityBridge.isAvailable(),
    isOwnerChat: (chatId) => notifyChatId !== "" && String(chatId) === notifyChatId,
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
  });
  if (bot) {
    log("Telegram bot started (responds to /status)");
  } else {
    log("PICLAW_TELEGRAM_TOKEN not set — Telegram disabled");
  }
  eventNotifier.setNotifyTarget(bot, notifyChatId);
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
    log(`env update: online=${net.online} signal=${sig}`);
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
