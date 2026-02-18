# Piclaw removal plan

**Goal:** Remove web stack, orchestration, and skills layer so the repo is a tiny embedded runtime for Raspberry Pi.

**Branch:** `piclaw`

---

## 1. Remove entirely (directories / files)

| Target | Reason |
|--------|--------|
| `ui/` | Web dashboard (React/Vite). Not needed on Pi. |
| `vendor/` | A2UI spec and renderers. Frontend-only. |
| `apps/` | Android, iOS, macOS apps. Not Pi runtime. |
| `extensions/` | All channel plugins (Telegram, Slack, Discord, etc.). Re-add Telegram later in `comms/`. |
| `packages/` | moltbot, clawdbot. Separate products. |
| `skills/` | Skills layer. Not needed for minimal node. |
| `docs/` | Full docs site. Replace with minimal README later. |
| `test/` | E2E/unit tests for removed code. Re-add when we add features. |
| `Dockerfile`, `.dockerignore`, `docker-setup.sh`, `setup-podman.sh` | No Docker for embedded. |
| `fly.toml`, `fly.private.toml`, `render.yaml` | Cloud deploy configs. |
| `scripts/` (most) | Build, canvas, e2e, docker, ios, android, mac, protocol-gen, etc. Keep only what a minimal `node piclaw.js` needs (if any). |
| `vitest.*.ts`, `zizmor.yml` | Test/config for removed stack. |
| `.agent/`, `.agents/`, `Swabble/` | Tooling/scratch. |
| `assets/`, `README-header.png` | Branding assets. |

---

## 2. Keep (minimal runtime)

| Keep | Purpose |
|------|--------|
| `src/entry.ts` | Process entry; will become minimal loop. |
| `src/infra/` (trimmed) | `env.js`, `warning-filter.js`, minimal logging. |
| `src/config/` (trimmed) | Config load from env/file only (no gateway/sessions). |
| `src/cli/` (trimmed) | Single “run” or “start” command, or drop CLI and just run. |
| `openclaw.mjs` → `piclaw.js` | Entry script (rename in same step). |
| `package.json` | Name `piclaw`, script `"start": "node piclaw.js"`, minimal deps. |
| `tsconfig.json` | Build only `src` (no ui, no extensions). |
| `dist/` | Output of build; entry for `piclaw.js`. |

---

## 3. Target shape after removal

```
piclaw/
├── core/              # minimal runtime loop (from current src/entry + infra)
├── config/            # config load (from current src/config, trimmed)
├── system/            # (placeholder) wifi / power / location later
├── comms/             # (placeholder) telegram bridge later
├── hardware/         # (placeholder) gpio / uart later
├── piclaw.js          # main entry (rename from openclaw.mjs)
├── package.json       # trimmed
├── tsconfig.json
├── REMOVAL_PLAN.md    # this file
└── piclaw.service     # (add later) systemd for Pi
```

Everything else from OpenClaw is removed or reduced so the runtime can start with `node piclaw.js` (or `pnpm start`) without Docker, Redis, or external services.

---

## 4. Execution order

1. **Phase A – Delete whole trees**  
   Remove: `ui/`, `vendor/`, `apps/`, `extensions/`, `packages/`, `skills/`, `docs/`, `test/`, Docker/fly/render files, and non-essential scripts.

2. **Phase B – Strip `src/`**  
   Remove or stub: gateway, agents, plugins, daemon, browser, cron, web, all channel-specific code. Keep only entry, infra (env, warning-filter, minimal log), and a minimal config loader.

3. **Phase C – Rename and trim**  
   Rename `openclaw.mjs` → `piclaw.js`, update `package.json` (name, bin, scripts), trim `tsconfig.json` include. Ensure `node piclaw.js` runs.

4. **Phase D – Restructure (optional)**  
   Introduce `core/`, `config/`, `system/`, `comms/`, `hardware/` and move the kept code into them; add placeholders for future Pi features.

This document is the plan; Phase A and B are the “removal” steps. Phase C and D can follow in the next steps.
