# Piclaw agents and GitHub (deploy keys, branches)

## Deploy keys vs PAT (what to use)

| Credential | What you add in GitHub | Best for |
|------------|-------------------------|----------|
| **Deploy key (SSH)** | The **public** key line (`ssh-ed25519 AAAA…` from `cat ~/.ssh/*.pub`) under **Settings → Deploy keys** | `git clone`, `git pull`, `git push`, **creating branches on first push** — one key per Pi **per repo** (same Pi needs two keys: runtime repo + workspaces repo). |
| **PAT (fine-grained or classic)** | **Settings → Developer settings → Tokens** — never commit the secret | **GitHub HTTP API** (open/update **Issues**, Actions, GraphQL), `gh` CLI over HTTPS, automation that is not plain Git. Optional: set `PICLAW_GITHUB_PAT` in `.env` for integrations that already read it. |

**Recommendation**

- **Git + branches:** use **SSH deploy keys with “Allow write access”** on each repo. You only ever paste the **public** key into GitHub; the **private** key stays on the Pi.
- **Issues / API from the agent:** add a **PAT** in `.env` (`PICLAW_GITHUB_PAT`) with minimal scopes (e.g. Issues read/write for `workspaces` or `openclaw-1`). Do **not** replace deploy keys with PAT for everyday `git pull` unless you prefer HTTPS remotes everywhere.

**Workspaces repo:** yes — add **one deploy key per Pi** to `workspaces`, enable **read + write** (GitHub’s single checkbox: **Allow write access**). You need each agent’s **public** key in that repo’s Deploy keys page.

Each Pi uses **two SSH deploy key pairs** (ed25519): one for **openclaw-1** (runtime), one for **workspaces**. Private keys stay on the Pi; **public** keys go to GitHub.

## Branch model (created on GitHub)

| Purpose | Repo | Branch names (match hostname short name) |
|--------|------|---------------------------------------------|
| Runtime (piclaw code; merge `main` when operators ship fixes) | `GAN12003/openclaw-1` | `deagent01-runtime` … `deagent04-runtime` |
| Agent workspace (notes, logs, memory; safe to reset) | `GAN12003/workspaces` | `deagent01-workspace` … `deagent04-workspace` |

**Runtime repo deploy keys:** must have **Allow write access** if the Pi should **`git push`** its runtime branch. If keys are read-only, `git pull` still works; push will fail with `marked as read only` — edit each deploy key on `openclaw-1` and enable write.

**Workspaces:** empty repo was bootstrapped with `scripts/piclaw/init-workspaces-main.sh` (initial `main`). Agent briefing for operators and LLM: `templates/agent-workspace/GIT.md` (also on each `*-workspace` branch).

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
| deAgent01 | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPNgl8iVViq1bUJgeu2XwV0fIxhdQPJaK1e7qPLQGaMf deploy-deAgent01-openclaw-1` |
| deAgent02 | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICRNBUZ4cd8MsVKr4uNG/7+EXqGsdrXG1cRH1sTDqUey deploy-deAgent02-openclaw-1` |
| deAgent03 | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJYNVREOaxLEM3/CK9FTG+zRkFoWOeOML6pQ2mim5rHl deploy-deAgent03-openclaw-1` |
| deAgent04 | On the Pi run `scripts/piclaw/deagent04-print-deploy-keys.sh` (copy from laptop with `scp` if needed); paste the **piclaw** `.pub` line into this table when you document the fleet. |

### Repo `workspaces`

| Agent | Public key (single line) |
|-------|---------------------------|
| deAgent01 | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMoZb3glBAt2HqXBM2iPwbUOtCI+mHZyGMZxaXuUJiZt deploy-deAgent01-workspaces` |
| deAgent02 | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDubBWivpD0tavuzZybZPoJ0F5J2nkKm0IAwXWap4B52 deploy-deAgent02-workspaces` |
| deAgent03 | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKfkbJhIPHcLnobz4cbzVK/xYbikqcS/h38XU9DFHpRe deploy-deAgent03-workspaces` |
| deAgent04 | Same script prints a second line — the **workspaces** deploy key; paste it here when documenting. |

After adding keys, test from the Pi:

```bash
ssh -T git@github.com-piclaw
ssh -T git@github.com-workspaces
```

## deAgent04 quickstart (new Pi)

1. **SSH:** `ssh gan12003@deagent04` (or your hostname).
2. **Deploy key pairs:** from your dev PC (repo root): `scp scripts/piclaw/deagent04-print-deploy-keys.sh gan12003@deagent04:~/` then on the Pi `chmod +x ~/deagent04-print-deploy-keys.sh && bash ~/deagent04-print-deploy-keys.sh`. Register each **public** line on GitHub: **`openclaw-1`** → first key, **`workspaces`** → second key (**Allow write access** on both).
3. **Host aliases:** `scp scripts/piclaw/pi-ssh-github-snippet.conf gan12003@deagent04:~/` then on the Pi: `mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat ~/pi-ssh-github-snippet.conf >> ~/.ssh/config`. Run `ssh-keyscan -H github.com >> ~/.ssh/known_hosts` if needed. Verify: `ssh -T git@github.com-piclaw` and `ssh -T git@github.com-workspaces`.
4. **Install runtime + systemd:** follow [DEPLOY.md automated install](../DEPLOY.md#automated-install-linux-pi-clone--systemd--boot) so `piclaw` is under `/opt/piclaw` and enabled at boot (first run can use `main`; `install-pi.sh` falls back if `deagent04-runtime` is missing).
5. **Branches:** from `~/src/openclaw-1` (or your `PICLAW_GIT_CLONE_ROOT`), run `bash scripts/piclaw/agent-git-bootstrap.sh` — uses hostname → `deagent04-runtime` / `deagent04-workspace`. Re-run `install-pi.sh` with `PICLAW_RUNTIME_BRANCH=deagent04-runtime` once those branches exist, or use the rsync + restart block below.
6. **Secrets (never in chat):** in `/opt/piclaw/.env` (and optionally `/etc/piclaw.env` for systemd): **new** `PICLAW_TELEGRAM_TOKEN` (revoke any leaked token first), `PICLAW_TELEGRAM_CHAT_ID`, `OPENAI_API_KEY` (NVIDIA path for GLM 4.7 is already defaulted by `install-pi.sh`), optional `PICLAW_GITHUB_PAT`. `chmod 600` the env file. `sudo systemctl restart piclaw`.
7. **Profile:** optional `bash scripts/piclaw/set-agent-self-profile.sh deAgent04 deAgent04@yopmail.com '<image-id>'` from the repo clone after identity exists.

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

## Auto-create branches on first run (no PAT required for Git)

Branches like `deagent02-runtime` / `deagent02-workspace` can be created by a normal **`git push`** after deploy keys (write) are registered — **no PAT** is required for that.

Script: `scripts/piclaw/agent-git-bootstrap.sh`

- Sets `PICLAW_AGENT_ID` from the hostname (e.g. `deagent02`) unless you override it in the environment.
- Clones (if missing) under `~/src` by default (`PICLAW_GIT_CLONE_ROOT`), creates/updates **`$PICLAW_AGENT_ID-runtime`** and **`$PICLAW_AGENT_ID-workspace`**, pushes to `origin`.
- Requires **SSH host aliases** in `~/.ssh/config` (`github.com-piclaw`, `github.com-workspaces`) and **write** deploy keys on both repos.

**One-time on a Pi:** copy the script to e.g. `~/agent-git-bootstrap.sh`, `chmod +x`, run it, or install `scripts/piclaw/piclaw-git-bootstrap.service.example` as a systemd oneshot (see comments inside that file).

**Workspaces repo:** create it on GitHub with at least **one commit on `main`** (e.g. README) so `origin/main` exists before the script runs.

Optional env (same names work if exported or placed in `/opt/piclaw/.env` for systemd):

- `PICLAW_AGENT_ID` — override hostname-based id  
- `PICLAW_GIT_CLONE_ROOT` — default `$HOME/src`  
- `PICLAW_RUNTIME_REPO_SSH` / `PICLAW_WORKSPACE_REPO_SSH` — SSH URLs using the host aliases above  

## PAT for Issues / API only (optional)

If the agent should **file GitHub Issues** or call the **REST API**, configure `PICLAW_GITHUB_PAT` in `.env` (see `.env.example`). That is separate from deploy keys; rotate the PAT if it leaks.

**`PICLAW_GITHUB_USERNAME`** is optional: `/status` treats the GitHub integration as configured when **only** the PAT is set (username can be filled in later for display).

**`PICLAW_GITHUB_ORG`** (optional, e.g. `pixelagents`) is passed into the agent system prompt so Issues and `gh` commands default to the right org. Prefer **`gh`** with `GH_TOKEN` / env over baking a second HTTP client in Piclaw.

## Owner Telegram: git ops and runtime update

When `PICLAW_TELEGRAM_CHAT_ID` matches the chat, these commands are available (see `piclaw_runtime/comms/telegram.js`):

- **`/showupdates`** — `git fetch` in `PICLAW_GIT_CLONE_ROOT` (default `~/src/openclaw-1`), then a short log of commits on `PICLAW_GIT_UPSTREAM_REF` (default `origin/main`) not in the current branch.
- **`/suggestgit`** — read-only `git status` + `git diff --stat` (capped).
- **`/updateandrestart`** — runs the checked-in script `piclaw_runtime/scripts/agent-runtime-update.sh` (fixed path only; no user shell fragments): `git pull --ff-only`, `rsync` of `piclaw_runtime/` into `/opt/piclaw` (or `PICLAW_RUNTIME_INSTALL`) with the same excludes as manual docs, `npm install --omit=dev`, `sudo systemctl restart piclaw`.

**sudoers (operator setup):** if the service user cannot restart systemd without a password, add a **NOPASSWD** rule for that user to run **only** this script and **`systemctl restart piclaw`**, or use a systemd path/timer running as root. Example (adjust user and paths):

```sudoers
piclaw-01 ALL=(root) NOPASSWD: /opt/piclaw/piclaw_runtime/scripts/agent-runtime-update.sh, /bin/systemctl restart piclaw
```

## Workspace template

See repository `templates/agent-workspace/` in this repo for a minimal layout you can copy into `workspaces` on each agent branch.
