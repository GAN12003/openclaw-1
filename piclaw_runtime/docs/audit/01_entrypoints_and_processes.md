# Piclaw — entrypoints and processes (as-built audit)

All entrypoints, how they run, env vars, ports, and platform (Pi vs Windows/WSL).

---

## 1. Telegram runtime — piclaw.js

| Item | Detail |
|------|--------|
| **Path** | `piclaw_runtime/piclaw.js` |
| **How run** | `node piclaw.js` or `npm start` (package.json: `"start": "node piclaw.js"`). On Pi: systemd `ExecStart=/usr/bin/node /opt/piclaw/piclaw.js` or `/opt/piclaw/current/piclaw.js` when using A/B. |
| **Required env** | `.env` loaded from `path.join(__dirname, ".env")` (optional). For Telegram: `PICLAW_TELEGRAM_TOKEN`. For chat: `OPENAI_API_KEY`. |
| **Ports** | None (outbound only: Telegram long polling, HTTPS for update probe, GitHub, etc.). |
| **Dependencies** | identity, identity_bridge, watchdog, health, wifi, budget, telegram (comms), sensors, introspection, integrations, goal_loop, update_probe, uart_identity, hardware (detect_platform, uart_watch, gpio_watch, gpio_control), events, economy. |
| **Start** | `npm start` or `node piclaw.js` from runtime dir. Systemd: `sudo systemctl start piclaw`. |
| **Stop** | Ctrl+C or `sudo systemctl stop piclaw`. |
| **Pi-only vs cross-platform** | Runs on Windows/WSL; UART/GPIO and Pi-specific sensors (vcgencmd, iw wlan0) are no-op or graceful fallback when not Pi (`detect_platform.isRaspberryPi()`). |

---

## 2. Mini-app gateway — gateway/server.js

| Item | Detail |
|------|--------|
| **Path** | `piclaw_runtime/gateway/server.js` |
| **How run** | Separate process: `node gateway/server.js` or `npm run gateway` (package.json: `"gateway": "node gateway/server.js"`). Not started by piclaw.js. |
| **Required env** | `PICLAW_TELEGRAM_TOKEN` (for initData validation). Optional: `PICLAW_GATEWAY_PORT` (default 3180), `PICLAW_MINI_APP_OWNER_TELEGRAM_ID` (or owner from identity `self.owner`). |
| **Ports** | Default **3180** (TCP). Binds `0.0.0.0` (all interfaces). |
| **Dependencies** | express, gateway/auth.js, api/gateway_api.js, identity_bridge (for owner + isAvailable). |
| **Start** | `npm run gateway` or `node gateway/server.js` from runtime dir. No systemd unit in repo; can be added as separate service or same user. |
| **Stop** | Ctrl+C or kill the process. |
| **Pi-only vs cross-platform** | Works on Windows/WSL; gateway_api uses hardware state only when `detectPlatform.isRaspberryPi()` is true. |

---

## 3. Updater script and systemd expectations

| Item | Detail |
|------|--------|
| **Updater script path (in repo)** | `piclaw_runtime/scripts/piclaw-update.sh` |
| **Installed location (Pi)** | Intended to be installed as `/usr/local/bin/piclaw-update` (docs: AB-UPDATE.md, DEPLOY.md). |
| **How invoked** | By user or by Telegram `/update`: `core/update_channel.js` runs `execSync("piclaw-update", { timeout: 120_000 })`. |
| **Expectations** | Script expects A/B layout: `BASE="/opt/piclaw"`, `current` symlink to `piclaw_A` or `piclaw_B`; copies new runtime into the other slot, `ln -sfn $TARGET $BASE/current`, `sudo systemctl restart piclaw`. Health check: waits for `$BASE/current/.boot-ok` (up to 20s), else rolls back symlink and restart. |
| **systemd unit (in repo)** | `piclaw_runtime/piclaw.service`. |
| **Unit expectations** | `WorkingDirectory=/opt/piclaw` (DEPLOY.md) or `WorkingDirectory=/opt/piclaw/current` when using A/B (AB-UPDATE.md). `ExecStart=/usr/bin/node /opt/piclaw/piclaw.js` or `/opt/piclaw/current/piclaw.js`. `EnvironmentFile=/etc/piclaw.env`. User: e.g. `piclaw-01`. |
| **Note** | The bundled `piclaw.service` uses `WorkingDirectory=/opt/piclaw` and `ExecStart=/usr/bin/node /opt/piclaw/piclaw.js`. For A/B, operator must change to `WorkingDirectory=/opt/piclaw/current` and `ExecStart=/usr/bin/node /opt/piclaw/current/piclaw.js` (documented in AB-UPDATE.md). |

---

## 4. Summary: what runs where

| Entrypoint | Pi (systemd) | Windows/WSL | Notes |
|------------|--------------|-------------|--------|
| piclaw.js | Yes (piclaw.service) | Yes (manual/node) | Telegram + sensors + goal loop + update probe; hardware active only on Pi. |
| gateway/server.js | Manual or separate unit | Yes (manual/node) | Not started by piclaw.js; must be run separately. |
| piclaw-update | As /usr/local/bin/piclaw-update | N/A | Bash script; A/B swap and systemctl restart piclaw. |

---

## 5. Environment variables (entrypoint-related)

- **piclaw.js**: Loads `.env` from runtime dir. Key vars: `PICLAW_TELEGRAM_TOKEN`, `OPENAI_API_KEY`, `PICLAW_IDENTITY_PATH`, `PICLAW_TELEGRAM_CHAT_ID`, `PICLAW_GOAL_REVIEW_INTERVAL_HOURS`, `PICLAW_UPDATE_*`, `PICLAW_GPIO_*`, integration vars (see .env.example). On Pi, `/etc/piclaw.env` is used via systemd `EnvironmentFile`.
- **gateway/server.js**: Same env source if run from same dir; needs `PICLAW_TELEGRAM_TOKEN`; optional `PICLAW_GATEWAY_PORT`, `PICLAW_MINI_APP_OWNER_TELEGRAM_ID`.
- **piclaw-update.sh**: Uses `BASE=/opt/piclaw`; no env file; expects `sudo` for systemctl and possibly for slot dirs depending on setup.
