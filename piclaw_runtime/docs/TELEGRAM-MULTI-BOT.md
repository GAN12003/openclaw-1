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
| **`all`** | **Default when unset.** Every non-command text message in a `group` / `supergroup` can trigger the chat model (same as legacy behavior). |
| **`mention`** | Only run the model when the user **@mentions this bot’s username**, uses a **text_mention** for this bot, or **replies to a message from this bot**. Private chats are unchanged (no mention required). |

Set in `/opt/piclaw/.env` (or via **`/set_key`**):

```bash
PICLAW_TELEGRAM_GROUP_REPLY_MODE=mention
```

Then `sudo systemctl restart piclaw`.

**Why use `mention`:** With several bots in one group, `all` can cause **every** bot to call the API on each message (cost, rate limits, duplicate answers). `mention` keeps untagged traffic **silent** (no LLM call, no reply).

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

## Fleet rollout checklist

On each Pi, after deploy:

1. Optional: `PICLAW_TELEGRAM_GROUP_REPLY_MODE=mention` for shared multi-bot groups.
2. Optional: `PICLAW_SUPPRESS_EMBODIMENT_REMINDERS=1` to quiet integration nags.
3. `sudo systemctl restart piclaw`.

Bulk SSH sync: `scripts/piclaw/sync-piclaw-fleet.sh` (see script header for env vars).
