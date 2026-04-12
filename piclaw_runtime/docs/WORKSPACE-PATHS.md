# Piclaw: where things live (dev machine vs Pi)

This file maps **paths** so you do not confuse a **Git clone** with the **installed runtime**.

## On your PC (Cursor / VS Code “workspace”)

- **Repo root:** your local checkout of `openclaw-1` (e.g. `C:\Users\...\openclaw-piclaw` on Windows). This **is** a git repo — you commit and push from here.
- **Piclaw source in-repo:** `piclaw_runtime/` (what gets rsync’d to the Pi).

## On each Raspberry Pi (agent)

| Role | Typical path | Git repo? |
|------|----------------|-----------|
| **Installed runtime** (what `node` runs) | `/opt/piclaw` | **No** — files are copied here (`rsync` from `piclaw_runtime/` or A/B slots). |
| **Identity / durable memory** | `/opt/piclaw_identity` (override `PICLAW_IDENTITY_PATH`) | **No** — not a git worktree; holds `self.json`, goals, ledger, etc. |
| **Runtime source clone** (git pull, merges) | `~/src/openclaw-1` (override `PICLAW_GIT_CLONE_ROOT`) | **Yes** — branch like `deagent02-runtime`. |
| **Workspaces clone** (notes, logs, skills) | **`~/src/workspaces`** (recommended; see `scripts/piclaw/agent-git-bootstrap.sh`) | **Yes** — branch like `deagent03-workspace` (GitHub branch names are usually **lowercase**). |

### Optional: workspaces repo under identity

Some operators want `PICLAW_IDENTITY_PATH/workspaces/` as a single tree. That works if the **piclaw user** owns the directory and you use normal `git clone` there — but the **recommended** layout in `docs/GITHUB-AGENTS.md` is still **`$HOME/src/workspaces`** so identity backups do not entangle with a large git object store. Pick one layout per Pi and stay consistent.

Bootstrap both runtime + workspace branches:

```bash
# On the Pi, with SSH host aliases + deploy keys configured
bash scripts/piclaw/agent-git-bootstrap.sh
```

Or clone only workspaces under identity:

```bash
bash scripts/piclaw/clone-workspaces-under-identity.sh
```

## Telegram: two different “update” commands

| Command | What it does |
|---------|----------------|
| **`/update`** | Runs **`piclaw-update`** (A/B slot installer). Fails with “not found” if you never set up A/B — **expected** on a simple `/opt/piclaw` install. See **`piclaw_runtime/docs/AB-UPDATE.md`**. |
| **`/updateandrestart`** (owner chat) | **`git pull`** in `PICLAW_GIT_CLONE_ROOT`, **`rsync`** `piclaw_runtime/` → `/opt/piclaw`, **`npm install --omit=dev`**, **`systemctl restart piclaw`**. See **`piclaw_runtime/docs/GITHUB-AGENTS.md`** (sudoers). |

If you saw *“A/B update not set up”* while typing **`/updateandrestart`**, you were on a build where **`/update`** was matched as a substring (fixed in current `telegram.js`: **`/update`** must be the whole command). Deploy the fix, then use **`/updateandrestart`** again.

If you saw that message while using **`/update`** only, that is expected without **`piclaw-update`** — use **`/updateandrestart`** for the standard Pi workflow (after rsyncing newer code at least once so the script exists under `/opt/piclaw/scripts/`).

## SSH from your PC

This development environment **cannot** open SSH sessions to your Pi. From your laptop, use your normal SSH user (e.g. `gan12003@deagent02`) and run the commands in `DEPLOY.md` / `GITHUB-AGENTS.md`.
