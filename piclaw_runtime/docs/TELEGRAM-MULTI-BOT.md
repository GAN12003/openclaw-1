# Telegram: multiple bots in one group

Piclaw can run several instances (different Pis, different bot tokens) in the **same Telegram group**. This page explains limits, privacy, and the env vars that control replies and reminders.

## BotFather and group privacy

- In **BotFather**, each bot has **Group Privacy**. If privacy is **on**, the bot only sees messages that **mention** it, **commands** aimed at it, or **replies** to its messages (standard Telegram behavior).
- If privacy is **off**, the bot receives **every** message in the group. Piclaw then uses **`PICLAW_TELEGRAM_GROUP_REPLY_MODE`** so each instance does not call the chat model on every line (see below).

## Bot-to-bot messages (API limit)

The Bot API **does not deliver** messages **authored by another bot** to your bot. So one Piclaw bot cannot rely on seeing another bot’s group messages for coordination inside Telegram.

Workarounds:

- A **human** relays text, or
- **Off-Telegram** coordination (HTTP, git, shared queue) between nodes.

## Natural-language chat in groups: `PICLAW_TELEGRAM_GROUP_REPLY_MODE`

| Value     | Behavior |
| --------- | -------- |
| **`mention`** | **Default when unset.** Only run the model when the user **@mentions this bot’s username**, uses a **text_mention** for this bot, or **replies to a message from this bot**. Other bots in the same group stay silent. Private chats are unchanged (no @ required). |
| **`all`** | Every non-command text message in a `group` / `supergroup` can trigger the model — use only when **one** Piclaw bot is in the chat (legacy). |

Default is already **`mention`** (no env line needed). To restore old behavior for a **single** bot in a group, set in `/opt/piclaw/.env` (or **`/set_key`**):

```bash
PICLAW_TELEGRAM_GROUP_REPLY_MODE=all
```

Then `sudo systemctl restart piclaw`.

**Why `mention` is default:** With several bots in one group, **`all`** makes **every** bot call the API on each message (cost, rate limits, duplicate answers like three “I’m here” replies). **`mention`** keeps bots that were not @-addressed **silent** (no LLM call, no reply).

## Reply threading (user → model, bot → Telegram UI)

- When you **reply to a specific message** in Telegram, Piclaw prepends a short **quoted context block** (message id, sender label, and text when available) to the text sent to the model, so the agent answers **in context of that message**. If the quoted message had no text, Piclaw may use its **snippet cache** (recent messages it saw in that chat) or a placeholder like `[photo]`.
- Piclaw’s chat replies use **`reply_to_message_id`** so they appear **threaded under your message** in the Telegram app (default on).

Env: **`PICLAW_TELEGRAM_CHAT_REPLY_THREAD=1`** (default) keeps threaded sends; set **`0`** / **`false`** / **`off`** to send flat messages (the model still receives the reply-context prefix when you used Telegram reply).

## Typing indicator

While generating a reply to natural-language chat, Piclaw sends **`sendChatAction(chat_id, "typing")`** before calling the model and **refreshes typing about every 4 seconds** until the reply is ready (Telegram typing expires after a few seconds).

## Embodiment and integration reminders: `PICLAW_SUPPRESS_EMBODIMENT_REMINDERS`

**Default when unset: reminders are on** (boot nag, goal-review “Thoughts”, agency `notify_owner` for integration items, motivation experiments that only notify about missing integrations).

Set to **`1`**, **`true`**, or **`yes`** to suppress:

1. The **45s boot** Telegram message about incomplete embodiment (missing integrations).
2. **“Thoughts:”** lines from the goal review loop that come only from **`integration`**-type suggestions (other suggestion types still notify).
3. **Agency** `notify_owner` for **`integration`** suggestions and **intention** upkeep for **`prepare_integration_setup`**.
4. **Motivation** candidate experiments whose only action is **notify_owner** about missing integrations.

```bash
PICLAW_SUPPRESS_EMBODIMENT_REMINDERS=1
```

`/status` and **`/setup`** still show what is missing; this flag only reduces **unsolicited** Telegram nags.

## Owner commands in groups

Use **`PICLAW_TELEGRAM_OWNER_USER_IDS`** (comma-separated numeric user ids) and/or **`PICLAW_TELEGRAM_CHAT_ID`** so owner-only commands work when the chat id is not your private DM. See `.env.example` and `DEPLOY.md`.

## Message reactions (emoji on any message in chat)

Piclaw subscribes to **`message_reaction`** updates (polling `allowed_updates` includes it). In **groups**, the bot usually must be an **administrator** with permission to read messages so Telegram delivers reaction events.

When someone **adds** a reaction (not removals), Piclaw matches the emoji to a **preset** and writes to identity knowledge:

| Preset       | Default emojis | Stored as |
| ------------ | -------------- | --------- |
| `heart`      | ❤ ❤️           | `memory` — good idea, worth keeping |
| `fire`       | 🔥             | `memory` — long-term / follow-up flag |
| `thumbs_up`  | 👍 (+ skin tones) | `feedback_good` — adopt as positive feedback |
| `thumbs_down`| 👎             | `feedback_bad` — avoid repeating; dispreferred |
| `applause`   | 👏             | `memory` — operator approved to proceed now |

**Context:** Piclaw keeps a short rolling cache of message text keyed by `chat_id` + `message_id` for messages it saw (incoming text/caption and outgoing chat replies). Reactions on older or unseen messages still create entries, but the snippet may say the text was not cached.

**Env:**

- **`PICLAW_TELEGRAM_REACTIONS_ENABLED`** — default **on** (`1`); set `0` / `false` / `off` to disable.
- **`PICLAW_TELEGRAM_REACTIONS_OWNER_ONLY=1`** — only count reactions from users listed in **`PICLAW_TELEGRAM_OWNER_USER_IDS`** (same ids as owner commands). Default **off** (everyone in the chat).
- **`PICLAW_TELEGRAM_REACTION_MAP`** — JSON object mapping extra emoji strings (or `custom:<id>`) to one of the preset names above.

Restart **`piclaw`** after changing env.

## Fleet rollout checklist

On each Pi, after deploy:

1. Default is `mention` for groups (no action). If you need every line to trigger chat with **one** bot only, set `PICLAW_TELEGRAM_GROUP_REPLY_MODE=all`.
2. Optional: `PICLAW_SUPPRESS_EMBODIMENT_REMINDERS=1` to quiet integration nags.
3. Optional: add the bot as **admin** in the group if you rely on **reaction** capture.
4. `sudo systemctl restart piclaw`.

Bulk SSH sync: `scripts/piclaw/sync-piclaw-fleet.sh` (see script header for env vars).
