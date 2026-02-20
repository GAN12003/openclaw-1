# Piclaw — next steps plan (as-built audit)

Prioritized roadmap (max 10 bullets) with rationale and estimated complexity (S/M/L).

---

1. **Rollback guard for A/B updates (M)**  
   **Why:** Today the updater reverts the symlink if .boot-ok is not seen within 20s, but there is no persistent “last known good” slot or limit on consecutive bad boots. A stuck or repeatedly failing slot can require manual intervention.  
   **What:** Persist last-successful slot (e.g. in /opt/piclaw_identity or a small state file outside slots). After N consecutive health failures (e.g. .boot-ok missing on start), automatically switch back to last good slot and restart. Optionally cap retries per slot before giving up.  
   **Complexity:** M — script + optional small daemon or systemd helper; state file format and location to agree.

2. **Gateway Phase 2/3/4 endpoints (M)**  
   **Why:** Current gateway exposes only GET /status, /devices, /review. A mini-app may need to trigger actions (e.g. run goal review, request update, or read/write goals) with the same initData auth.  
   **What:** Phase 2: read-only extensions (e.g. goals, suggestions, experiences tail). Phase 3: safe actions (e.g. trigger review, request update) with owner check and rate limit. Phase 4: any write/command endpoints only with explicit allowlist and audit. Reuse gateway_api and auth; no new secrets in responses.  
   **Complexity:** M — design surface and rate limiting; reuse existing identity_bridge and update_channel.

3. **UART device fingerprint refinement strategy (M)**  
   **Why:** Current fingerprint uses baud, traffic type, and signature_hash; near-match is baud+traffic only. Devices that share baud+traffic but differ in banner/payload can be confused.  
   **What:** (a) Include first N bytes or a hash of stable banner in signature so same physical device is more stable across power cycles. (b) Optional “fingerprint revision” in registry so old entries can be migrated. (c) Confidence decay (already present in uart_identity/decay.js) plus optional manual “merge” or “split” device from mini-app/Telegram. Document fingerprint schema version.  
   **Complexity:** M — backward compatibility with existing uart_registry.json and matcher logic.

4. **Servo/motor actuation strategy — safe power and driver (L)**  
   **Why:** GPIO output today is limited to pulse/set for discrete pins with whitelist and cooldown. Servos/motors need sustained or PWM control and safe power handling to avoid damage or injury.  
   **What:** (a) Define “actuator” abstraction: allowed pins, max on-time, duty cycle or angle limits, and mandatory cooldown. (b) Prefer a dedicated driver (e.g. pigpio or kernel PWM) rather than raw GPIO for motors. (c) Require explicit enable (e.g. PICLAW_ACTUATOR_ENABLED and per-pin allowlist). (d) Document power supply and fuse recommendations. (e) No automatic actuation from events; only via Telegram/gateway commands with owner check.  
   **Complexity:** L — hardware, safety, and possibly new process or C extension for PWM.

5. **Pi Zero W performance limits notes (S)**  
   **Why:** Pi Zero W is single-core, limited RAM, and slow I/O; running Node, Python extensions (Twitter, UART probe), and Telegram polling can hit CPU/memory and thermal limits.  
   **What:** Document in docs: (a) Recommended Node options (e.g. --max-old-space-size), (b) goal review interval and suggestion load (e.g. keep PICLAW_GOAL_REVIEW_INTERVAL_HOURS ≥ 6), (c) avoiding heavy work in hot loops, (d) optional swap and cooling, (e) that gateway and piclaw can be split to two processes if needed. Add a short “Pi Zero W” section in DEPLOY.md or a dedicated performance.md.  
   **Complexity:** S — documentation and optional defaults.

6. **Gateway binding and CORS hardening (S)**  
   **Why:** Gateway binds to 0.0.0.0 and uses CORS *; when behind a reverse proxy or in a locked-down LAN, binding to 127.0.0.1 and restricting origins reduces exposure.  
   **What:** PICLAW_GATEWAY_BIND (default 0.0.0.0); PICLAW_GATEWAY_CORS_ORIGINS (optional list; if set, replace *). Document use with nginx/caddy and HTTPS.  
   **Complexity:** S — small server.js and auth middleware changes.

7. **Identity dir permission enforcement (optional) (S)**  
   **Why:** warnIdentityPermissions only logs; lax permissions on /opt/piclaw_identity risk exposure on multi-user or compromised host.  
   **What:** Optional env (e.g. PICLAW_IDENTITY_STRICT_PERMS=1) that, if identity dir exists and (mode & 0o77) !== 0 or ownership mismatch, refuse to start or refuse writes with a clear error. Keep current behavior when not set.  
   **Complexity:** S — validate at startup and/or at first write.

8. **Rate limiting on gateway (S)**  
   **Why:** No per-IP or per-user limit; a leaked or forged initData could be replayed (within auth_date window) or brute-forced.  
   **What:** In-memory or file-based rate limit per user id (from initData) and/or per IP: e.g. max N requests per minute per user. Return 429 when exceeded.  
   **Complexity:** S — middleware and config.

9. **Moltbook integration (if productized) (L)**  
   **Why:** Moltbook is currently a placeholder (token check only). If the product relies on it, implement real API calls and document flows.  
   **What:** Define scope (auth, sync, commands); implement client in integrations/; add to registry and status; keep tokens out of logs/responses.  
   **Complexity:** L — depends on Moltbook API and product requirements.

10. **Centralized write guard (optional) (M)**  
    **Why:** Writes today are constrained by design (identity_bridge only uses paths.js; runtime writes to known files). A single “allowed write paths” check could catch bugs and future code that writes outside runtime/identity.  
    **What:** Optional module that wraps fs.writeFileSync / appendFileSync / rename (or a small set of write APIs) and rejects if path is outside SAFE_ROOT or IDENTITY_ROOT. Enable only in dev or via env.  
    **Complexity:** M — requires consistent use of wrapper or patching; can be phased.

---

## Summary table

| # | Item | Complexity | Priority (from audit) |
|---|------|------------|------------------------|
| 1 | Rollback guard A/B | M | High |
| 2 | Gateway Phase 2/3/4 | M | High |
| 3 | UART fingerprint refinement | M | Medium |
| 4 | Servo/motor actuation | L | Medium |
| 5 | Pi Zero W performance notes | S | High (docs) |
| 6 | Gateway bind + CORS | S | Medium |
| 7 | Identity strict perms | S | Low |
| 8 | Gateway rate limiting | S | Medium |
| 9 | Moltbook integration | L | If productized |
| 10 | Centralized write guard | M | Low |
