# Builder-Researcher autonomy — loop and files

Audit of the motivation layer that lets Piclaw generate its own goals and experiments, execute bounded actions, and account for cost. Identity storage is under `PICLAW_IDENTITY_PATH` (default `/opt/piclaw_identity`) and persists across A/B updates.

## Operating mode

**Builder-Researcher**: opportunism + experimentation; small reversible moves; budget-aware. Goals and experiments are agent-owned (Piclaw can mutate `goals.json`, `identity_state.json`, `experiments.json` via the motivation and actions layers). Core identity (`self.json`) is not auto-edited.

## Loop (idea → goal → action → learning)

1. **Perception** (every 5–10 min via existing loops) — integrations status, update availability, disk, last review, experiences tail.
2. **Motivation** (every 45 min; first run 8 min after boot) — `motivation/scheduler.js` runs: scan state → generate candidate experiments → rank by `(expected_value * (1 - risk)) - cost_estimate` → enqueue top 1–2 into `experiments.json`.
3. **Execution** — Phase 1: human-triggered via Telegram `/run_experiment <id>`. Each run goes through `actions/index.js`: budget check → perform → ledger append → budget record.
4. **Reflection** — Outcome is logged to `ledger.jsonl`; identity_state and beliefs can be updated in a later phase.

## Identity files (under identity root)

| File | Purpose |
|------|--------|
| `identity_state.json` | Mutable personality + beliefs: mode, traits (opportunism, experimentation, caution, verbosity), beliefs (integration_reliability, reach), resources (api_budget_daily, api_budget_spent_today, last_reset_day), reputation. |
| `experiments.json` | Queue of experiments: `{ active: [ { id, title, hypothesis, expected_value, cost_estimate, risk, action_plan, status, created_at } ] }`. |
| `ledger.jsonl` | Append-only log of autonomous actions: one JSON object per line (ts, action, result, message). |
| `goals.json` | Same schema as before; in Builder-Researcher mode the agent may edit this via controlled flows (not yet implemented). |

Daily budget is enforced in `identity_state.resources`: `api_budget_spent_today` is reset when `last_reset_day` is not today (see `identity_bridge.ensureDailyBudgetReset()`).

## Runtime modules

| Path | Role |
|------|------|
| `identity_bridge` | Paths, readers, writers for identity_state, experiments, ledger; `ensureDailyBudgetReset()`. |
| `motivation/scan_state.js` | Gathers integrations, update, goals, identity_state, experiments, last_review, ledger tail, disk. Never throws. |
| `motivation/goal_synth.js` | `generateCandidates(scanState)` → list of candidate experiments (Phase 1: notify_owner, update_check, probe_uart, repo_scan). |
| `motivation/experiment_ranker.js` | `scoreExperiment(exp)`, `rankAndSelect(candidates, topN)`. |
| `motivation/scheduler.js` | `start()`: first run 8 min, then every 45 min; enqueues top 2 into experiments. |
| `economy/cost_model.js` | `estimateCost(actionType)` for repo_scan, update_check, probe_uart, notify_owner. |
| `economy/budget_guard.js` | `ensureDailyReset()`, `getBudgetState()`, `canSpend(amount)`, `recordSpend(amount)` (reads/writes identity_state). |
| `actions/index.js` | `perform(action, options)`: allowlist check → budget check → run action (repo_scan in-process; others via `options.runAction`) → append ledger → recordSpend. Phase 1 actions: repo_scan, update_check, probe_uart, notify_owner. |

## Telegram commands

- `/experiments` — Read-only list of experiment queue and budget (calls `getExperimentsText()`).
- `/run_experiment <id>` — Run one experiment by id (loads experiment, runs first action_plan step via `actions.perform()`).

## Safety

- All writes use identity_bridge lock + atomic write (or append for ledger).
- Failures in motivation/scheduler and actions are swallowed (no crash).
- Piclaw does not edit `self.json` automatically; only goals, identity_state, experiments, ledger are writable by this layer.
- Execution is bounded: only allowlisted action types; daily budget cap; ledger for postmortems.

## Phase 2+ (not in scope here)

- Auto-run top experiments (without requiring `/run_experiment`).
- Twitter/Moltbook post actions; reply budget caps.
- Reflection writer that updates identity_state beliefs from outcomes.
- Mini App control room for experiments and budget.
