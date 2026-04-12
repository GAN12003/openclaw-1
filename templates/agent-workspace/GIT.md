# Git (read first)

## Your branches (hostname = agent id, e.g. `deagent02`)

| Repo | Branch | Use |
|------|--------|-----|
| `GAN12003/openclaw-1` | `<hostname>-runtime` | Piclaw **code**; merge `main` when operators ship fixes; sync to `/opt/piclaw`. |
| `GAN12003/workspaces` | `<hostname>-workspace` | **This** branch: notes, logs, memory, small projects. Safe to reset. |

## Auth

- **SSH deploy keys** on the Pi (`~/.ssh/config` hosts `github.com-piclaw`, `github.com-workspaces`) — used for `git pull` / `git push` on those branches.
- **`/status` “Github: MISSING”** means **no `PICLAW_GITHUB_PAT`** (HTTP API). It does **not** mean SSH is broken. For Issues/API, add a PAT in `/opt/piclaw/.env`; optional.

## Commands (on Pi)

```bash
# Runtime update after main is fixed upstream
cd ~/src/openclaw-1 && git fetch && git checkout <hostname>-runtime && git merge origin/main
rsync -a --exclude node_modules --exclude .env ./piclaw_runtime/ /opt/piclaw/
cd /opt/piclaw && npm install --omit=dev && sudo systemctl restart piclaw

# Workspace
cd ~/src/workspaces && git checkout <hostname>-workspace && git pull
```

Runtime repo push needs deploy keys with **write** on `openclaw-1` (see `piclaw_runtime/docs/GITHUB-AGENTS.md`).
