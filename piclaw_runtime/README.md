# Piclaw runtime

Minimal standalone embedded runtime for Raspberry Pi. No OpenClaw dependency.

## Setup

```bash
cd piclaw_runtime
npm install
```

Optional: set `PICLAW_TELEGRAM_TOKEN` for the Telegram bot.

## Run

```bash
npm start
# or: node piclaw.js
```

- Logs to console.
- If `PICLAW_TELEGRAM_TOKEN` is set, bot responds to `/status` with CPU temp, uptime, WiFi, and API budget.

## Layout

- `piclaw.js` — entrypoint, starts bot, aggregates system data
- `system/health.js` — CPU temp, uptime
- `system/wifi.js` — WiFi SSID, signal
- `system/budget.js` — mock API usage tracker
- `comms/telegram.js` — Telegram bot (/status)

Dependencies: `node-telegram-bot-api`, `systeminformation`.
