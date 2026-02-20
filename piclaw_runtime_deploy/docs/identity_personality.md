# Identity and personality — what shapes the agent

Where the agent’s “who I am” and behaviour come from, and what to edit to change them.

---

## 1. On the Pi (runtime identity — edit these to change this node)

These files live under **`/opt/piclaw_identity/`** (or `PICLAW_IDENTITY_PATH`). The runtime reads them; the chat system prompt injects their content.

| File | What it does | Edit to change |
|------|----------------|----------------|
| **self.json** | `mission`, `name`, `owner`, `values` (array of strings) | Mission statement, display name, and value/principles (e.g. “observe before acting”, “remain recoverable”). |
| **goals.json** | `long_term`, `mid_term`, `short_term` (arrays of strings or `{ "text": "..." }`) | Long- and short-term goals; goal review and suggestions use these. |
| **meta.json** | `self_summary` (one line) | Single-sentence “who I am” shown at top of context. You can also set it via chat with the `set_self_summary` tool. |

Example **self.json** (excerpt):

```json
{
  "name": "piclaw",
  "mission": "edge-aware autonomous diagnostics node",
  "values": [
    "observe before acting",
    "never damage host system",
    "remain recoverable",
    "prefer reversible actions"
  ]
}
```

Example **goals.json**:

```json
{
  "long_term": ["Keep the node healthy and responsive", "Report anomalies early"],
  "mid_term": [],
  "short_term": ["Complete setup of integrations"]
}
```

No Markdown file is read from the identity dir; only these JSON files are used.

---

## 2. In the repo (hardcoded prompt and defaults)

### System prompt text (personality and instructions)

**File:** [piclaw.js](piclaw_runtime/piclaw.js) — function `buildChatSystemPrompt()` (around lines 306–387).

This builds the system prompt. The strings that shape personality and behaviour include:

- **Opening / role** (lines 312–313):  
  `"You are Piclaw: a personal assistant running on this Raspberry Pi. You ARE able to run terminal commands..."`

- **“Who I am / What I can do”** (lines 314–315):  
  `"You are Piclaw. You run on this Raspberry Pi. You have: exec (shell), Telegram commands..."`

- **Safety** (lines 333–334):  
  `"No independent goals; prioritize safety and human oversight; comply with stop/pause..."`

- **Behavior** (lines 336–337):  
  `"When the user asks to run a command or do something on the Pi: call exec..."`

After that, the prompt appends (when identity is available):

- `Self-summary: …` (from meta.json)
- `Mission: …`, `Name: …`, `Values: …` (from self.json)
- `Long-term goals: …`, `Short-term goals: …` (from goals.json)

To change tone, role, or rules: edit those string literals in `buildChatSystemPrompt()` in **piclaw.js**.

### Default identity (used by bootstrap and when self.json is missing)

**File:** [identity_bridge/defaults.js](piclaw_runtime/identity_bridge/defaults.js).

- **defaultSelf()** — default `mission`, `name`, `values` (e.g. `"edge-aware autonomous diagnostics node"`, `"observe before acting"`, etc.).
- **defaultGoals()** — default `long_term`, `mid_term`, `short_term` (empty arrays).
- **defaultMeta()** — includes `self_summary: ""`.

When you run `node scripts/bootstrap-identity.js` or when the runtime seeds identity from `state.json`, it uses these defaults. To change what new installs or bootstrap get, edit **identity_bridge/defaults.js**.

---

## 3. Skills (optional extra personality / instructions)

Skills in **`/opt/piclaw/skills`** (or `PICLAW_SKILLS_DIR`) are loaded into the system prompt. Each skill is a directory with a **SKILL.md** file; the content of SKILL.md is appended under `## Skill: <name>`.

So any **SKILL.md** under `/opt/piclaw/skills/<skill_name>/` can add instructions, tone, or domain rules that shape how the agent behaves. Edit or add those files (on the Pi or in a repo you deploy) to change behaviour per skill.

---

## 4. Docs that describe identity (for humans; not read by the agent)

| Doc | Purpose |
|-----|--------|
| [DEPLOY.md](piclaw_runtime/DEPLOY.md) | How to create `/opt/piclaw_identity`, bootstrap script, and minimal self.json/goals.json. |
| [docs/audit/00_tree.md](piclaw_runtime/docs/audit/00_tree.md) | Directory tree and identity schema table (paths, meta.json, self_summary, etc.). |
| [docs/audit/07_consciousness_memory_identity_gaps.md](piclaw_runtime/docs/audit/07_consciousness_memory_identity_gaps.md) | What was implemented for identity/consciousness. |

Updating these keeps the docs accurate; they do not feed into the prompt.

---

## Quick checklist: change the agent’s personality

- **This node only (no code deploy):**  
  Edit on the Pi: `/opt/piclaw_identity/self.json` (mission, values), `goals.json`, `meta.json` (self_summary). Restart piclaw if you want a clean state.

- **All new installs / bootstrap:**  
  Edit in repo: `identity_bridge/defaults.js` (default mission, values, goals).

- **Fixed wording and rules for everyone:**  
  Edit in repo: `piclaw.js` → `buildChatSystemPrompt()` (the strings above).

- **Extra instructions or tone per skill:**  
  Edit or add `SKILL.md` in `/opt/piclaw/skills/<name>/` on the Pi (or in a skills repo you deploy).
