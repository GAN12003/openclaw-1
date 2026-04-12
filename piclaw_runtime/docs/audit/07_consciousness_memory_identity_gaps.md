# Consciousness, memory, and identity gaps — summary

Short audit of what was in place, what was missing, and what was implemented to "finish" the consciousness and feel of the Piclaw node.

## What was already in place

- **Identity**: `device_id` from core/identity; soul in `/opt/piclaw_identity` (self, goals, experiences). Chat gets mission/goals/values and "who I am / what I can do." `/whoami`, `/review_status` use it.
- **Memory**: Learned tools + memory topic injected into chat; experiences tail 30; memory tool (remember/recall); learn tool; conversation history (last 20 messages).
- **Perception**: perceive → interpret → express. Events: wake, input_detected (UART), touch (GPIO), filesystem_scan, update_available, agency_action. Narratives go to experience log and optional Telegram notify.
- **Agency**: Reads suggestions, runs only policy-allowed actions, appends experience.
- **Presence**: Periodic "I remain operational.", "My memory is accessible.", device-awareness line.
- **Skills**: ClawHub-aware; skills from `/opt/piclaw/skills` loaded into system prompt.
- **Body scan**: Used at boot for "filesystem_scan" percept.

## Gaps that were addressed

1. **Identity "not configured" on the node**  
   - **Done**: DEPLOY.md documents creating `/opt/piclaw_identity` and minimal `self.json`/`goals.json`; `scripts/bootstrap-identity.js` creates the dir and default files; `/setup` in Telegram shows "Identity not configured…" when identity is unavailable; chat system prompt adds one line telling the agent to say so and suggest `/opt/piclaw_identity` or the bootstrap script.

2. **Memory: no crisp self-summary across restarts**  
   - **Done**: `meta.json` has optional `self_summary`; readers/writers in identity_bridge; one line injected at top of "Who I am" in the system prompt; `set_self_summary` chat tool so the agent can set it.

3. **"How it feels": no LCD (embodiment)**  
   - **Done**: Optional I2C LCD 1602 driver in `perception/lcd.js`; `express.say()` pushes the last 1–2 lines to the display when `PICLAW_LCD_ENABLED=1`. Config: `.env.example` and DEPLOY.md (optional hardware section).

4. **Perception not wired for goal review**  
   - **Done**: After `runReview()` (success or skip), `perception.emit("goal_review_done", { result, duration_ms, reason? })`; `interpret.js` has a case that returns "Goal review completed." or "Goal review skipped (…)."

5. **Identity strictness and safety**  
   - **Done**: Optional `PICLAW_IDENTITY_STRICT_PERMS=1`: if the identity dir exists and ownership/mode are wrong, the runtime refuses to start with a clear message. Documented in DEPLOY.md and `.env.example`.

## Config and setup references

- **DEPLOY.md** — Identity layer, bootstrap script, optional LCD, strict permissions.
- **.env.example** — `PICLAW_IDENTITY_PATH`, `PICLAW_IDENTITY_STRICT_PERMS`, `PICLAW_LCD_ENABLED`, `PICLAW_LCD_I2C_ADDR`.

## Deferred (other audit items)

- Rollback guard for A/B updates.
- Gateway Phase 2/3/4 (read goals/suggestions, trigger review; safe actions with rate limit).
- UART fingerprint refinement.
- Pi Zero W performance notes in docs.

See **05_next_steps_plan.md** for broader roadmap.

## Structured memory and retrieval (later addition)

- **On-disk format**: `knowledge/memory.json` and `knowledge/learned_tools.json` can be stored as v1 `{ "version": 1, "entries": [ ... ] }` with optional `category` and `tags` per entry; legacy flat `{ "key": "value" }` is still read and merged on write.
- **Tools**: `memory_search` (keyword/category/tag), optional `memory_recall_semantic` when `PICLAW_MEMORY_EMBEDDINGS_ENABLE=1`; `memory` store accepts optional `category` and `tags`.
- **Prompt**: Default `PICLAW_MEMORY_PROMPT_MODE=minimal` avoids dumping full JSON into the system prompt; use `full` for legacy behavior. **Grounding** section instructs the model to verify live state with `exec` / `read_file`.
- **Session summaries**: Optional `PICLAW_SESSION_SUMMARY_ENABLE` appends short lines to `knowledge/session_summaries.jsonl` and injects the latest snippet into the system prompt.
- **Ledger**: `type: context_stats` lines log approximate system/history character counts. Optional `knowledge/pattern_stats.json` (aggregated chat counts by day) when `PICLAW_PATTERN_STATS_ENABLE=1`.
