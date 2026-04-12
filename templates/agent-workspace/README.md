# Agent workspace

Short map for the agent (keep files small; prefer append-only logs).

| Path | Purpose |
|------|---------|
| `memory/` | Durable notes (md/json) — small chunks |
| `logs/` | Rotated journal; optional `session-*.log` |
| `skills/` | Tool docs and prompts this agent uses |
| `projects/` | Code or scratch tied to tasks |
| `IDENTITY.md` | Optional: mission, owner, constraints (1 screen) |

Reset: delete branch contents or force-push branch; runtime identity stays on the Pi under `/opt/piclaw` and `/opt/piclaw_identity`.
