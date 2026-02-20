# Piclaw runtime — directory tree and schema (as-built audit)

Generated from current repo layout. Depth 6; key files noted.

**Docs maintenance:** When you add or remove modules, or change the layout or public APIs, update this tree and the identity schema table below. Also update `docs/audit/02_features_matrix.md` and `docs/audit/07_consciousness_memory_identity_gaps.md` if the change affects features or consciousness/identity behaviour.

---

## piclaw_runtime/ directory tree

```
piclaw_runtime/
├── .boot-ok                    # Written on successful boot (piclaw.js)
├── .env.example                # Env var template; copy to .env
├── .gitignore
├── DEPLOY.md                   # Deploy + identity + A/B instructions
├── package.json                # main: piclaw.js; scripts: start, gateway
├── piclaw.js                   # Main entrypoint (Telegram runtime)
├── piclaw.service              # systemd unit (for Pi; expects /opt/piclaw or /opt/piclaw/current)
├── presence_loop.js            # Periodic say(): "I remain operational.", memory, device line
├── skills_loader.js            # Load skills from /opt/piclaw/skills into system prompt
├── README.md
├── state.json                  # Optional runtime state (identity_bridge/validate.js seeds self from this if self.json missing)
├── update_state.json           # Update probe state (update_probe/state.js)
├── version.json                # Version for update probe (update_probe/check_remote.js)
├── actions/
│   └── index.js                # perform(action); ledger log; budget check; Phase 1: repo_scan, update_check, probe_uart, notify_owner
├── agency/
│   └── agency_loop.js          # Reads suggestions + intentions; runs policy-allowed actions; intention tick (upkeep by intention); perception.emit(agency_action)
├── api/
│   └── gateway_api.js          # Pure API for gateway: getStatusJson, getDevices, getReview
├── comms/
│   └── telegram.js             # createBot(); /status, /whoami, /review_status, /update, /gpio, /probe_uart, /setup, etc.
├── core/
│   ├── exec_run.js             # runShellCommand for chat exec tool
│   ├── identity.js             # loadIdentity(); .device_identity.json in runtime dir
│   ├── self_guard.js           # SAFE_ROOT (runtime dir), isPathSafe()
│   ├── self_inspect.js         # getSelfInspectionAsync(); slot, version, disk, extensions
│   ├── update_channel.js       # requestUpdate(); execSync piclaw-update
│   └── watchdog.js             # Heartbeat to heartbeat.json every 30s
├── docs/
│   ├── AB-UPDATE.md            # A/B slots, piclaw-update, systemd with /opt/piclaw/current
│   ├── audit/                  # This audit (00–09); 09 = Codex Telegram auth plan
│   └── boot-partition/
│       ├── README.md
│       ├── network-config
│       └── user-data
├── economy/
│   ├── billing_status.js       # OPENAI_API_KEY, PICLAW_MONTHLY_BUDGET
│   ├── budget_guard.js         # Daily API budget; ensureDailyReset, canSpend, recordSpend (identity_state)
│   ├── cost_model.js          # estimateCost(actionType) for motivation/actions
│   ├── policy.js               # Autonomy / budget policy
│   └── wallet_status.js        # PICLAW_WALLET_ADDRESS, PICLAW_WALLET_LABEL
├── events/
│   ├── engine.js               # handleGPIOEvent, handleUARTActivity; rules + notifier
│   ├── notifier.js             # setNotifyTarget(bot, chatId); notify(message)
│   ├── rules.js                # getRules() from rules.json
│   ├── rules.json              # gpio/uart event rules (notify, cooldown)
│   └── state.js                # shouldFire, recordFire (cooldown)
├── extensions/
│   ├── README.md
│   ├── twitter_api/            # Python; /twitter integration
│   │   ├── api/, config/, utils/, tests/
│   │   ├── langchain_tools.py, twitter.py, twitter_check.py, requirements.txt
│   │   └── ...
│   └── uart_probe/
│       ├── requirements.txt
│       └── uart_probe.py        # UART probe subprocess
├── gateway/
│   ├── auth.js                 # validateInitData, isAllowed (Telegram initData + owner)
│   └── server.js               # Express; GET /status, /devices, /review; auth middleware; port 3180
├── motivation/
│   ├── experiment_ranker.js     # scoreExperiment; rankAndSelect(candidates, topN)
│   ├── goal_synth.js           # generateCandidates(scanState); Builder-Researcher experiment candidates
│   ├── scan_state.js           # scanState(); integrations, update, goals, identity_state, experiments, ledger tail, disk
│   └── scheduler.js            # start(); every 45 min scan → synth → rank → enqueue; first run 8 min after boot
├── goal_loop/
│   ├── evaluator.js            # evaluateGoals(goals, experienceLines, knowledge)
│   ├── health_gate.js          # runHealthGate(); disk + runtime writable (SAFE_ROOT)
│   ├── review.js               # runReview(); hash state, computeIntentions, suggestions, intentions; perception.emit(goal_review_done)
│   ├── scheduler.js            # start(); setInterval runReview (PICLAW_GOAL_REVIEW_INTERVAL_HOURS)
│   └── suggestions.js          # Goal suggestions; optional intention-based reordering (used by review.js)
├── hardware/
│   ├── detect_platform.js      # isRaspberryPi() (/proc/cpuinfo)
│   ├── gpio_control.js          # pulsePin, setPinFor; gpioset; whitelist, cooldown
│   ├── gpio_watch.js           # gpiomon; PICLAW_GPIO_PINS
│   ├── hardware_state.js       # Aggregates UART + GPIO state
│   └── uart_watch.js           # createReadStream /dev/serial0 or /dev/ttyAMA0; pause/resume
├── identity_bridge/
│   ├── defaults.js             # defaultSelf, defaultGoals, defaultMeta, defaultIdentityState, defaultExperiments
│   ├── index.js                # Public API; readers, writers, validate, lock; loadIdentityState, loadExperiments, loadLedgerTail, appendLedgerLine, ensureDailyBudgetReset
│   ├── lock.js                 # withLock(.lock); stale lock 60s; freezeAvailability
│   ├── paths.js                # IDENTITY_ROOT; identityStatePath, experimentsPath, ledgerPath; etc.
│   ├── readers.js              # loadSelf, loadGoals, loadIdentityState, loadExperiments, loadLedgerTail, getLastReview, etc.
│   ├── validate.js             # validateIdentity; warnIdentityPermissions; checkStrictIdentityPermissions
│   └── writers.js              # atomicWrite; writeIdentityState, writeExperiments, appendLedgerLine, ensureDailyBudgetReset; etc.
├── integrations/
│   ├── github_api.js           # getGitHubAuthStatus(); PICLAW_GITHUB_PAT
│   ├── github_identity.js      # isConfigured (PAT, username)
│   ├── mail_identity.js        # isConfigured (SMTP host/user/pass)
│   ├── moltbook_identity.js    # isConfigured (PICLAW_MOLTBOOK_TOKEN) — placeholder
│   ├── codex_auth.js           # Codex OAuth via Telegram; startCodexLogin, completeCodexLogin, isPendingRedirect (see 09_codex_telegram_auth.md)
│   ├── openai_chat.js          # chatWithTools; OPENAI_API_KEY, OPENAI_CHAT_MODEL; exec, memory, read_file, learn, set_self_summary
│   ├── registry.js             # checkIntegrations(); github, twitter, smtp, moltbook
│   ├── smtp_api.js             # sendTestMail(); PICLAW_SMTP_*; PICLAW_SMTP_TEST_TO
│   ├── twitter_api_bridge.js   # getTwitterStatus(); calls extension
│   ├── twitter_identity.js     # isConfigured (PICLAW_TWITTER_*)
│   └── uart_probe_bridge.js    # runUARTProbe(); spawns extensions/uart_probe/uart_probe.py
├── introspection/
│   ├── body_scan.js            # Boot filesystem_scan percept; identity + extensions count
│   ├── filesystem_view.js      # getFilesystemView, listRuntimeDir; uses SAFE_ROOT, isPathSafe
│   ├── process_info.js         # getProcessInfo (pid, memory, uptime)
│   └── version_state.js        # getVersionState (version.json, slot from cwd)
├── perception/
│   ├── express.js              # say(); appendExperience + optional notify + optional LCD
│   ├── interpret.js            # interpret(event) → narrative; wake, input_detected, touch, filesystem_scan, goal_review_done, etc.
│   ├── lcd.js                  # Optional I2C LCD 1602; pushLine(); PICLAW_LCD_ENABLED, PICLAW_LCD_I2C_ADDR
│   └── perceive.js             # emit(type, payload); interpret → express.say
├── sensors/
│   ├── connectivity.js        # checkConnectivity(); DNS api.openai.com
│   ├── power_status.js         # vcgencmd get_throttled (Pi only)
│   └── wifi_status.js          # iw dev wlan0 link (Linux)
├── system/
│   ├── budget.js               # getBudget(); API spend
│   ├── health.js               # getHealth(); cpu temp, uptime (systeminformation)
│   └── wifi.js                 # getWifi(); wraps wifi_status + systeminformation
├── uart_identity/
│   ├── decay.js                # runIfDue(); decay confidence in registry
│   ├── fingerprint.js          # fingerprintFromProbe(probeResult)
│   ├── matcher.js              # identifyDevice(probeResult); registry match/update
│   └── registry.js             # load/save via identity_bridge (uart_registry.json in identity)
├── update_probe/
│   ├── check_remote.js         # checkRemote(); GitHub releases or PICLAW_UPDATE_URL
│   ├── scheduler.js            # startUpdateScheduler(notifyFn); interval from PICLAW_UPDATE_INTERVAL_HOURS
│   └── state.js                # loadProbeState/saveProbeState → update_state.json
└── scripts/
    ├── bootstrap-identity.js   # Create identity dir + minimal self.json, goals.json, meta.json (run on Pi)
    ├── deploy-to-pi.ps1        # Windows deploy to Pi
    ├── piclaw-update.sh        # A/B updater; install as /usr/local/bin/piclaw-update
    └── setup-pi-remote.sh      # One-time Pi setup; /opt/piclaw_identity
```

Note: `heartbeat.json` is written by `core/watchdog.js` under the runtime directory (path: `path.join(__dirname, "..", "heartbeat.json")`). `.device_identity.json` is written by `core/identity.js` under the runtime directory (`path.join(__dirname, "..", ".device_identity.json")`).

---

## /opt/piclaw_identity schema files (paths the code expects)

Resolved by `identity_bridge/paths.js` from `PICLAW_IDENTITY_PATH` or `/opt/piclaw_identity`. All paths are under that root.

| Path under identity root | Purpose |
|--------------------------|---------|
| `self.json` | Device/soul: device_id, name, owner, mission, values (identity_bridge/paths.js `selfPath()`) |
| `relationships.json` | relationshipsPath() |
| `goals.json` | goalsPath(); long_term, mid_term, short_term |
| `experiences.log` | experiencesPath(); append-only log |
| `experiences.1.log` | experiencesRotatedPath(); rotated when > 5 MB |
| `goal_history.log` | goalHistoryPath(); goal review log |
| `goal_history.1.log` | goalHistoryRotatedPath() |
| `preferences.json` | preferencesPath() |
| `meta.json` | metaPath(); schema_version, self_summary (one-line prompt), etc. |
| `suggestions.json` | suggestionsPath(); goal loop suggestions |
| `intentions.json` | intentionsPath(); active intentions (review loop); working intent for suggestion weighting |
| `identity_state.json` | identityStatePath(); builder-researcher mutable state (traits, beliefs, resources, last_reset_day) |
| `experiments.json` | experimentsPath(); queue of candidate experiments (active[]) |
| `ledger.jsonl` | ledgerPath(); append-only log of autonomous actions |
| `codex_credentials.json` | codexCredentialsPath(); OAuth tokens for OpenAI Codex (do not commit; see docs/audit/09_codex_telegram_auth.md) |
| `last_review.json` | lastReviewPath(); last review result |
| `.last_review_hash` | lastReviewHashPath(); hash for change detection |
| `uart_registry.json` | uartRegistryPath(); UART device registry |
| `.last_uart_decay` | lastUartDecayPath(); last decay run |
| `.lock` | lockPath(); advisory lock for writes |
| `knowledge/<topic>.json` | knowledgePath(topic); topic = sanitized string |

---

## Core modules present?

| Module | Present | Location |
|--------|---------|----------|
| core/identity.js | Yes | `piclaw_runtime/core/identity.js` — loadIdentity(); .device_identity.json in runtime |
| core/self_guard.js | Yes | `piclaw_runtime/core/self_guard.js` — SAFE_ROOT, isPathSafe() |
| core/watchdog.js | Yes | `piclaw_runtime/core/watchdog.js` — heartbeat.json every 30s |
| core/update_channel.js | Yes | `piclaw_runtime/core/update_channel.js` — requestUpdate() → piclaw-update |
| core/self_inspect.js | Yes | `piclaw_runtime/core/self_inspect.js` — getSelfInspectionAsync() |
| core/exec_run.js | Yes | `piclaw_runtime/core/exec_run.js` — runShellCommand() |

All listed core modules are present.
