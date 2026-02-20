# Piclaw — security and safety review (as-built audit)

Secrets inventory, logging/response exposure, update safety, identity lock/writes, gateway exposure, and concrete hardening actions.

---

## 1. Secrets inventory (env var names only)

| Env var | Used by | Purpose |
|---------|--------|---------|
| PICLAW_TELEGRAM_TOKEN | comms/telegram.js, gateway/server.js, gateway/auth.js | Bot API; initData validation |
| OPENAI_API_KEY | piclaw.js (chat), integrations/openai_chat.js, economy/billing_status.js | Chat + budget presence |
| PICLAW_GITHUB_PAT | integrations/github_identity.js, integrations/github_api.js | GitHub auth |
| PICLAW_GITHUB_USERNAME | integrations/github_identity.js | Optional username |
| PICLAW_TWITTER_AUTH_TOKEN | integrations/twitter_identity.js | Twitter API |
| PICLAW_TWITTER_CT0 | integrations/twitter_identity.js | Twitter API |
| PICLAW_TWITTER_SCREEN_NAME | .env.example | Optional |
| PICLAW_SMTP_HOST, PICLAW_SMTP_USER, PICLAW_SMTP_PASS | integrations/mail_identity.js, integrations/smtp_api.js | SMTP |
| PICLAW_SMTP_TEST_TO | integrations/smtp_api.js | Test mail recipient only |
| PICLAW_MOLTBOOK_TOKEN | integrations/moltbook_identity.js | Moltbook (placeholder) |
| PICLAW_MINI_APP_OWNER_TELEGRAM_ID | gateway/server.js | Optional owner restriction |
| PICLAW_IDENTITY_PATH | identity_bridge/paths.js | Override identity root |
| PICLAW_MONTHLY_BUDGET | economy/billing_status.js, economy/policy.js | Observation only |
| OPENAI_CHAT_MODEL | integrations/openai_chat.js | Optional model override |

Non-secret but sensitive: PICLAW_TELEGRAM_CHAT_ID (notification target), PICLAW_WALLET_ADDRESS, PICLAW_WALLET_LABEL (observation only).

---

## 2. Secrets not logged or returned

| Check | Result | Evidence |
|------|--------|----------|
| Telegram token in logs | Not logged | comms/telegram.js logs only `token.length`, not value. |
| Telegram token in responses | Not returned | buildStatusText, buildWhoamiText, and Telegram handlers never include token. |
| Gateway responses | No secrets | gateway_api.getStatusJson returns identity (device_id, hostname, mission), health, wifi, system, version, hardware, last_review, update — no tokens or PATs. getDevices/getReview same. |
| GitHub PAT / SMTP / Twitter / Moltbook | Not in status or gateway | Status text and gateway API expose only “OK”/“MISSING”/“FAILED” and, for GitHub, login/rate limit; no PAT or passwords. |
| initData in gateway | Used only for validation | gateway/auth.js validates hash; server does not log or return initData. |

Conclusion: No secrets are logged or returned by Telegram or gateway responses. Token length is logged (low risk).

---

## 3. Update mechanism safety

| Aspect | Current state | Notes |
|--------|----------------|-------|
| External updater | Yes | piclaw-update.sh is separate; not part of runtime code. |
| A/B slots | Yes | Two slots; symlink switch; identity dir untouched. |
| Rollback on health failure | Yes | Script reverts symlink and restarts if .boot-ok not present within 20s. |
| Rollback guard / retry limit | No | No persistent “last good slot” or max consecutive failures; operator could add. |
| Fetch source | Configurable | PICLAW_UPDATE_SOURCE=github|url; script currently copies from /home/piclaw-01/piclaw_runtime/* (example in script). |
| Permissions | Script uses sudo for systemctl | Slot dirs and npm install run as user; systemctl restart needs sudo. |

Recommendation: Add a rollback guard (e.g. persist last-known-good slot, auto-revert after N failed boots) — see 05_next_steps_plan.md.

---

## 4. Identity lock, stale lock recovery, atomic writes, file perms

| Aspect | Implementation | Notes |
|--------|----------------|-------|
| Lock file | identity_bridge/lock.js: .lock under identity root | Exclusive create (wx); released in finally. |
| Stale lock recovery | Yes | If .lock exists and mtime older than STALE_LOCK_THRESHOLD_MS (60_000), unlink then acquire. |
| Atomic writes | Yes | identity_bridge/writers.js: atomicWrite() — write to .tmp, fsync, rename. Used for self, goals, last_review, suggestions, uart_registry, etc. |
| File perms warning | Yes | identity_bridge/validate.js warnIdentityPermissions(): warns if identity dir not owned by process user or (mode & 0o77) !== 0. No enforcement. |

Warning: Identity dir permissions are only warned; operators must set chmod 700 and correct ownership (docs and setup scripts state this).

---

## 5. Gateway exposure risks

| Risk | Current state | Notes |
|------|----------------|-------|
| Bind 0.0.0.0 | Listens on all interfaces | Default port 3180; suitable for LAN/mini-app; consider binding to loopback or specific IP if exposed. |
| CORS * | Access-Control-Allow-Origin * | Any origin can send credentialed requests if browser sends initData; auth is by initData + owner, not origin. |
| Owner check | Optional but supported | PICLAW_MINI_APP_OWNER_TELEGRAM_ID or self.owner; if set, only that Telegram user can pass authMiddleware. |
| Rate limiting | None | No per-IP or per-user rate limit. |
| HTTPS | Not in repo | Gateway is HTTP; reverse proxy (e.g. nginx) should terminate TLS in production. |

---

## 6. Concrete hardening actions (ordered, minimal)

1. **Identity permissions** — In setup docs or script, state clearly: chmod 700 and chown for identity dir; consider a one-time check at startup that refuses to write if (stat.mode & 0o77) !== 0 (optional, configurable).
2. **Gateway binding** — Add env (e.g. PICLAW_GATEWAY_BIND=127.0.0.1) to bind to loopback when gateway is behind a reverse proxy; keep 0.0.0.0 as default for current use cases.
3. **Gateway CORS** — Restrict Access-Control-Allow-Origin to a configured list or to Telegram WebApp origin when known, instead of *.
4. **Rollback guard** — Persist “last good slot” after successful boot; in piclaw-update or a wrapper, revert to last good slot after N consecutive failed health checks to avoid stuck bad slot.
5. **Token in logs** — Remove or redact token length in production if desired (comms/telegram.js); low priority.
6. **Rate limiting** — Add optional rate limit (per initData user or per IP) on gateway routes to mitigate abuse.
7. **HTTPS** — Document that gateway must be behind TLS in production (e.g. nginx/caddy); no code change if proxy is used.
