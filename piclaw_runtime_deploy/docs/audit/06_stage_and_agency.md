# Piclaw — stage and Agency Bridge (as-built)

This doc captures the **stage** of the runtime and the role of the **Agency Bridge**: deterministic curiosity inside a cage.

---

## Stage: “Instrumented Runtime” → “Controlled Agency”

Piclaw is currently in a stage we can call **Instrumented Runtime**, moving toward **Autonomous Identity Loop** via a bounded **Agency Bridge**.

| Stage | Meaning |
|-------|--------|
| **Instrumented Runtime** | Remembers (identity), observes (UART/GPIO/health/update probe), evaluates (goal_review), suggests (suggestions.json), but acts **only when explicitly told** (/gpio, /probe_uart, etc.). |
| **Controlled Agency** (current) | Same as above, plus a small **agency loop** that reads suggestions + identity + environment and performs **policy-allowed** actions (probe_uart, notify_owner, check_updates, etc.) on a timer. No self-initiated install, code change, or GPIO output. |
| **Autonomous Identity Loop** (future) | Observe → interpret → decide → act → learn → adjust identity. Full loop with LCD/embodiment and richer self-expression; still bounded by policy. |

Today the architecture is:

```
observe → record → analyze → [agency: decide allowed action] → act (bounded) → record experience
```

The missing piece that was added is the **Agency Bridge**: a small orchestrator that turns **identity + suggestions + environment** into *allowed behaviors* only.

---

## Three layers (isolated for safety)

| Layer | Exists | Connected automatically? |
|-------|--------|---------------------------|
| Identity (`/opt/piclaw_identity`) | ✅ | Read by agency; only appendExperience / existing writers (no direct identity mutation by agency). |
| Goal loop (evaluation engine) | ✅ | Writes suggestions.json; **agency reads suggestions** and may act on them. |
| Hardware / gateway / Telegram | ✅ | Agency can trigger **policy-allowed** actions (probe, notify, check updates); GPIO only via explicit user/event rules. |

---

## Agency Bridge (implemented)

- **Location:** `piclaw_runtime/agency/agency_loop.js`, `piclaw_runtime/agency/policy.js`
- **Interval:** `PICLAW_AGENCY_INTERVAL_MIN` (default 5 minutes; 1–60).
- **Flow:** Load suggestions → for each suggestion map to action type → if policy allows and cooldown ok → perform via existing modules → append experience.
- **Policy (the leash):**  
  **Allowed:** probe_uart (rate-limited), notify_owner, refresh_status, check_updates, housekeeping, display_lcd (no-op until LCD exists).  
  **Never allowed:** install, code_change, gpio_output, internet_arbitrary.

Agency does **not** mutate identity directly; it only calls existing modules (UART probe, notifier, update check) and `identityBridge.appendExperience()`.

---

## Example: “Alive” behavior after Agency Bridge

**Before:** You must run `/probe_uart` yourself.

**After:** Piclaw sees a suggestion like “goal stalled (no recent activity)” with “run /probe_uart”. If policy allows and cooldown has passed, it runs a passive probe, records the result, updates device confidence via the existing matcher, and appends an experience line. No human asked.

---

## LCD and embodiment

Telegram = **command interface**. LCD (when added) = **embodiment interface**. With LCD + agency, the node can self-express (e.g. “I am Piclaw”, “Monitoring UART”, “Last review OK”) without waiting for a command. The agency loop and policy remain the single place that decides what self-initiated actions are allowed.

---

## Summary

- **Stage:** Instrumented Runtime + **Controlled Agency** (bounded decision executor).
- **Agency Bridge:** Reads suggestions + identity + environment; performs only policy-allowed actions; records to experiences; never mutates identity directly or does install/code change/GPIO/arbitrary internet.
- **Design:** Deterministic curiosity inside a cage — stable on a Pi Zero.
