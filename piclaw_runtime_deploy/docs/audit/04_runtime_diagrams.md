# Piclaw — runtime diagrams (as-built audit)

Mermaid diagrams for main flows. Exact as per current code paths.

---

## 1. Runtime flow: boot → systemd → piclaw.js → sensors → telegram → identity

```mermaid
flowchart TB
  subgraph boot["Boot"]
    A[systemd: piclaw.service]
    A --> B[EnvironmentFile=/etc/piclaw.env]
    B --> C[ExecStart: node /opt/piclaw/current/piclaw.js]
  end
  C --> D[piclaw.js main]
  D --> E[Load .env from runtime dir]
  E --> F[identity.loadIdentity]
  F --> G[identityBridge.validateIdentity]
  G --> H[identityBridge.warnIdentityPermissions]
  H --> I[identityBridge.freezeAvailability]
  I --> J[watchdog.startWatchdog]
  J --> K[telegram.createBot]
  K --> L[updateProbe.startUpdateScheduler]
  L --> M[goalLoop.start]
  M --> N{detectPlatform.isRaspberryPi?}
  N -->|yes| O[uartWatch.startUARTWatch]
  N -->|no| P[skip hardware]
  O --> Q[gpioWatch.startGPIOWatch]
  Q --> R[senseEnv every 30s]
  P --> R
  R --> S[wifiStatus, powerStatus, connectivity]
  S --> T[runtime_state.environment]
  D --> U[fs.writeFileSync .boot-ok]
  K --> V[Bot: /status, /whoami, /update, ...]
  V --> W[buildStatusText uses identity, health, wifi, hardware]
  W --> X[identity_bridge loadSelf, loadGoals when whoami/review]
```

---

## 2. Update flow: probe → notify → /update → piclaw-update → slot switch

```mermaid
sequenceDiagram
  participant Scheduler as update_probe/scheduler
  participant Check as update_probe/check_remote
  participant State as update_probe/state
  participant User as Telegram user
  participant Bot as comms/telegram
  participant Channel as core/update_channel
  participant Script as piclaw-update.sh
  participant Systemd as systemd

  Scheduler->>Check: checkRemote()
  Check->>Check: getLocalVersion() from version.json
  alt PICLAW_UPDATE_SOURCE=github
    Check->>Check: GET GitHub releases/latest
  else PICLAW_UPDATE_SOURCE=url
    Check->>Check: GET PICLAW_UPDATE_URL
  end
  Check-->>Scheduler: { update_available, latest_version, current_version }
  Scheduler->>State: saveProbeState(last_checked)
  alt update_available && not yet notified
    Scheduler->>Bot: notifyFn({ latest_version, current_version })
    Bot->>User: sendMessage "Update available... Use /update to apply."
    Scheduler->>State: saveProbeState(last_notified_version)
  end

  User->>Bot: /update
  Bot->>Channel: requestUpdate()
  Channel->>Script: execSync("piclaw-update", timeout 120s)
  Script->>Script: Determine TARGET slot (A or B)
  Script->>Script: cp/copy new runtime into TARGET
  Script->>Script: ln -sfn TARGET /opt/piclaw/current
  Script->>Systemd: sudo systemctl restart piclaw
  Script->>Script: Wait for /opt/piclaw/current/.boot-ok (max 20s)
  alt .boot-ok present
    Script-->>Channel: exit 0
  else timeout
    Script->>Script: ln -sfn CUR /opt/piclaw/current
    Script->>Systemd: sudo systemctl restart piclaw
    Script-->>Channel: exit 1
  end
  Channel-->>Bot: { ok } or { ok: false, stderr }
  Bot-->>User: "Update requested..." or error message
```

---

## 3. UART flow: watch → /probe_uart pause → probe → matcher → registry → label

```mermaid
flowchart LR
  subgraph watch["UART watch (Pi only)"]
    A[uart_watch.startUARTWatch]
    A --> B[createReadStream /dev/serial0 or /dev/ttyAMA0]
    B --> C[onActivity → eventEngine.handleUARTActivity]
    C --> D[events/rules.json uart.activity]
    D --> E[notifier.notify if cooldown ok]
  end
  subgraph probe_cmd["/probe_uart"]
    F[User sends /probe_uart]
    F --> G[uartWatch.pauseUARTWatch]
    G --> H[uart_probe_bridge.runUARTProbe]
    H --> I[spawn extensions/uart_probe/uart_probe.py]
    I --> J[result: device, baud, traffic, fingerprint]
    J --> K[uartWatch.resumeUARTWatch]
    K --> L[uart_identity/matcher.identifyDevice]
    L --> M[fingerprint.fingerprintFromProbe]
    M --> N{exact match in registry?}
    N -->|yes| O[update last_seen, seen_count; registry.save]
    N -->|near match| P[return confidenceHint, no persist]
    N -->|new| Q[devices.length < 64?]
    Q -->|yes| R[append to devices; registry.save]
    Q -->|no| S[rejected: registry_full]
    O --> T[Reply to user with device id, confidence]
    R --> T
    P --> T
    S --> T
  end
  subgraph label_cmd["/uart_label id label"]
    U[setUartLabel in piclaw.js]
    U --> V[registry.load, find device, set label]
    V --> W[registry.save]
    W --> X[identityBridge.appendExperience]
  end
  registry[(uart_registry.json in identity)]
  O --> registry
  R --> registry
  V --> registry
```

---

## 4. Mini-app flow: initData → gateway → gateway_api → identity/runtime

```mermaid
flowchart TB
  subgraph client["Telegram Mini App (browser)"]
    A[WebApp.initData]
    A --> B[GET/POST with X-Telegram-Init-Data or query/body initData]
  end
  B --> C[gateway/server.js]
  C --> D[express.json]
  D --> E[CORS: Access-Control-Allow-Origin *]
  E --> F[authMiddleware]
  F --> G{token set?}
  G -->|no| H[503 gateway_unconfigured]
  G -->|yes| I{initData present?}
  I -->|no| J[401 missing_init_data]
  I -->|yes| K[gateway/auth.isAllowed initData, token, getAllowedOwner]
  K --> L{auth valid?}
  L -->|no| M[401/403 invalid_signature or owner_mismatch]
  L -->|yes| N[Route]
  N --> O[GET /status]
  N --> P[GET /devices]
  N --> Q[GET /review]
  O --> R[gateway_api.getStatusJson]
  P --> S[gateway_api.getDevices]
  Q --> T[gateway_api.getReview]
  R --> U[health.getHealth, wifi.getWifi]
  R --> V[identity.loadIdentity]
  R --> W[identityBridge.loadSelf, getLastReview]
  R --> X[filesystemView, processInfo, versionState]
  R --> Y[hardwareState if Pi]
  R --> Z[updateProbe.checkRemote]
  S --> AA[uart_identity/registry.load]
  T --> W
  U --> JSON[JSON response]
  V --> JSON
  W --> JSON
  X --> JSON
  Y --> JSON
  Z --> JSON
  AA --> JSON
```
