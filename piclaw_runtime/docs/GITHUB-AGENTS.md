# Piclaw agents and GitHub (deploy keys, branches)

Each Pi uses **two SSH deploy key pairs** (ed25519): one for the **runtime** repo (`openclaw-1`), one for **workspaces**. Keys live only on that Pi; **public** keys are registered in GitHub.

## Branch model

| Purpose | Repo | Suggested branch names |
|--------|------|-------------------------|
| Runtime (piclaw code, pull fixes from `main`) | `GAN12003/openclaw-1` | `deagent02-runtime`, `deagent03-runtime` (one branch per agent; merge/rebase from `main` as you ship fixes) |
| Agent workspace (tools, notes, logs, memory) | `GAN12003/workspaces` | `deagent02-workspace`, `deagent03-workspace` (or match hostname) |

**Flow:** You fix on `main` (runtime) and push; each Pi **`git pull`** on its runtime branch (or merge `main` into it), then sync to `/opt/piclaw` and restart `piclaw`. Workspaces branch is for agent-owned files; reset or force-push that branch anytime without touching `main`.

## SSH host aliases (on each Pi)

Configured in `~/.ssh/config`:

- **`github.com-piclaw`** → uses `~/.ssh/id_ed25519_github_piclaw`
- **`github.com-workspaces`** → uses `~/.ssh/id_ed25519_github_workspaces`

Clone / remote URL examples:

```bash
git clone git@github.com-piclaw:GAN12003/openclaw-1.git
git clone git@github.com-workspaces:GAN12003/workspaces.git
```

## Register deploy keys on GitHub

For **each** public key below: repo → **Settings** → **Deploy keys** → **Add deploy key** → paste **one line** (starts with `ssh-ed25519`). Enable **Allow write access** if that agent should **push** (issues, logs, workspace commits).

### Repo `openclaw-1` (runtime)

| Agent | Public key (single line) |
|-------|---------------------------|
| deAgent02 | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICRNBUZ4cd8MsVKr4uNG/7+EXqGsdrXG1cRH1sTDqUey deploy-deAgent02-openclaw-1` |
| deAgent03 | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJYNVREOaxLEM3/CK9FTG+zRkFoWOeOML6pQ2mim5rHl deploy-deAgent03-openclaw-1` |

### Repo `workspaces`

| Agent | Public key (single line) |
|-------|---------------------------|
| deAgent02 | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDubBWivpD0tavuzZybZPoJ0F5J2nkKm0IAwXWap4B52 deploy-deAgent02-workspaces` |
| deAgent03 | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKfkbJhIPHcLnobz4cbzVK/xYbikqcS/h38XU9DFHpRe deploy-deAgent03-workspaces` |

After adding keys, test from the Pi:

```bash
ssh -T git@github.com-piclaw
ssh -T git@github.com-workspaces
```

## Sync runtime to `/opt/piclaw` after `git pull`

Preserve local secrets and installed modules:

```bash
cd ~/openclaw-1   # or your clone path
git fetch origin && git checkout deagent02-runtime && git pull
rsync -a --exclude node_modules --exclude .env ./piclaw_runtime/ /opt/piclaw/
cd /opt/piclaw && npm install --omit=dev
sudo systemctl restart piclaw
```

Adjust branch name and hostname for each agent.

## Workspace template

See repository `templates/agent-workspace/` in this repo for a minimal layout you can copy into `workspaces` on each agent branch.
