# Agent workspace

Read **`GIT.md`** for branch names (`<hostname>-runtime` vs `<hostname>-workspace`), SSH vs PAT, and sync commands.

Short map for the agent (keep files small; prefer append-only logs).

| Path | Purpose |
|------|---------|
| `memory/` | Durable notes (md/json) — small chunks |
| `logs/` | Rotated journal; optional `session-*.log` |
| `skills/` | Tool docs and prompts this agent uses |
| `projects/` | Code or scratch tied to tasks |
| `IDENTITY.template.md` | Copy to `IDENTITY.md` on the agent branch if needed |

Reset: delete branch contents or force-push branch; runtime identity stays on the Pi under `/opt/piclaw` and `/opt/piclaw_identity`.
