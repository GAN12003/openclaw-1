# Identity (optional)

- **Agent host:** (hostname, e.g. deAgent03)
- **Runtime branch:** (e.g. `deagent03-runtime` on `openclaw-1`)
- **Workspace branch:** (e.g. `deagent03-workspace` on `workspaces`) — **structured** notes, logs, `memory/`, `skills/`, small projects live here; chat + identity dir are not a substitute for committing to this branch.
- **Mission:** one line
- **Constraints:** no secrets in this file

## Piclaw `self.json` convention (on Pi: `/opt/piclaw_identity/self.json`)

Optional fields Piclaw reads for `/whoami`, `/status`, and the chat system prompt:

| Field | Example | Purpose |
|-------|---------|---------|
| `name` | `deAgent03` | Display name |
| `agent_id` | `deAgent03` | Same as host id when you want them aligned |
| `contact_email` | `deAgent03@yopmail.com` | One disposable inbox per agent (`deAgentNN@yopmail.com`) |
| `profile_image` | `setup_piclaw/piclaw_default.jpg` | Path **relative to runtime root** (`/opt/piclaw/…`) for default avatar asset |
| `credential_hint` | short string | Operator-only hint (e.g. disposable inbox check id); **not** for pasting Twitter `auth_token` / `ct0` |

Twitter session secrets stay in `/opt/piclaw/.env` as `PICLAW_TWITTER_*`, not in `self.json`.
