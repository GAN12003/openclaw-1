# Codex verification URL and Telegram auth in Piclaw

Plan for implementing OpenAI Codex (as OpenClaw uses it) authentication in Piclaw: agent sends a verification URL in Telegram, user opens it and logs in, then pastes the redirect URL back; credentials are stored and can be refreshed or re-generated when expired.

## Goal

- When the agent (or user) needs Codex for programming, long tool creation, or refactoring: **send an auth/verification URL in the Telegram chat**.
- User opens the URL, logs in, and provides access (paste redirect URL back into Telegram).
- Store OAuth credentials; when they expire or the user finishes a session, **generate a new URL** and send it again in Telegram.

OpenClaw uses **openai-codex** (ChatGPT OAuth, `@mariozechner/pi-ai`'s `loginOpenAICodex`) with a **remote flow**: show URL → user opens in local browser → user pastes redirect URL back. Piclaw will implement the same idea over Telegram instead of CLI prompts.

## Current state

- **OpenClaw** (`src/commands/openai-codex-oauth.ts`): uses `loginOpenAICodex` from `@mariozechner/pi-ai` with `createVpsAwareOAuthHandlers`; for remote/VPS it logs the URL and prompts "Paste the redirect URL" in the terminal.
- **Piclaw** (piclaw_runtime): standalone Node runtime; chat uses `integrations/openai_chat.js` with `OPENAI_API_KEY` and `api.openai.com` only; no Codex or OAuth. Telegram bot in `comms/telegram.js`; no auth-URL flow yet.

## Architecture (high level)

1. User sends `/codex_login` (or "use Codex for refactor") in Telegram.
2. Piclaw starts Codex OAuth, gets auth URL, sends it in chat with: "Open this URL in your browser, sign in, then paste the full redirect URL here."
3. User opens URL, logs in, copies the redirect URL (e.g. `http://localhost:1455/...` or the full address bar content), pastes it in Telegram.
4. Piclaw treats that message as the redirect URL, completes the OAuth exchange, stores credentials under identity root (e.g. `codex_credentials.json`), replies "Codex authorized."
5. When token expires or user wants a new session: user runs `/codex_login` again, or (Level 2) bot can proactively send "Session expired. Open this new URL to re-authorize: …".

## 1. Codex OAuth in piclaw_runtime

### 1.1 Dependency and flow

- **Option A (recommended):** Add `@mariozechner/pi-ai` to `package.json`. Use `loginOpenAICodex` with custom handlers:
  - **onAuth({ url }):** pass the URL to the Telegram sender and set internal state "waiting for redirect URL".
  - **onPrompt(prompt):** resolve with the next message from the owner in Telegram when state is "waiting for redirect URL".
- **Option B:** Minimal Codex OAuth client in piclaw_runtime (no pi-ai); duplicates logic and may break if OpenAI changes the flow.

Recommendation: **Option A** for parity with OpenClaw.

### 1.2 Where to store credentials

- Under identity root (`PICLAW_IDENTITY_PATH`): e.g. `codex_credentials.json` (or `credentials/codex.json`) with `access_token`, `refresh_token`, `expires_at`, etc. Use identity lock/write patterns; add to `.gitignore` and identity docs.

### 1.3 State for "waiting for redirect URL"

- In-memory (or tiny file) keyed by chatId when auth URL is sent.
- Next Telegram message from **owner** in that chat: if state set, treat as pasted redirect URL, complete OAuth, clear state, reply success/failure.
- Timeout (e.g. 10 min): clear state; optionally notify "Codex auth timed out; send /codex_login to try again."

## 2. Telegram integration

- **`/codex_login`** (or `/codex`): Start OAuth; send auth URL + instructions; set "waiting for redirect" for that chat.
- In the generic message handler: before `onChatMessage`, if this chat has "waiting for redirect", call `completeCodexLogin(chatId, messageText)` and do not run normal chat.
- Only **owner** (PICLAW_TELEGRAM_CHAT_ID / self.owner) can complete Codex login.

## 3. Using Codex for programming / long tools / refactor

- **Level 1 (auth only):** Verification URL flow + credential storage only. No Codex API calls yet.
- **Level 2 (use Codex for coding):** Route coding/refactor requests to Codex API with stored token (e.g. `codex_complete` tool or second model path). Separate follow-up.

Recommendation: implement **Level 1** first.

## 4. Implementation tasks

| # | Task | Notes |
|---|------|--------|
| 1 | Add `@mariozechner/pi-ai` to piclaw_runtime | Prefer pi-ai for parity with OpenClaw. |
| 2 | New module: `integrations/codex_auth.js` | `startCodexLogin()` → `{ authUrl }`; `completeCodexLogin(redirectUrl)` exchanges and stores creds. Custom onAuth/onPrompt for Telegram + state. |
| 3 | Credential storage under identity root | e.g. `codex_credentials.json`; lock; .gitignore; docs. |
| 4 | Pending state "waiting for redirect" | In-memory keyed by chatId; timeout ~10 min. |
| 5 | Telegram: `/codex_login` | Call `startCodexLogin(chatId)`; send URL + instructions; set pending. |
| 6 | Telegram: on message, if pending | Call `completeCodexLogin(chatId, text)`; reply success/failure; clear state. |
| 7 | Expiry / new URL | On 401 (Level 2) or `/codex_login` again: start flow, send new URL. |
| 8 | (Level 2) Use Codex for coding | Separate: route requests or "codex" tool to Codex API with stored token. |

## 5. Files to add or change

- **New:** `integrations/codex_auth.js` — OAuth flow, state, credential read/write.
- **New (Level 2):** `integrations/codex_api.js` — Call Codex/ChatGPT API with stored token.
- **Change:** `comms/telegram.js` — Register `/codex_login`; in message handler check pending redirect and call complete handler.
- **Change:** `piclaw.js` — Pass `startCodexLogin` / `completeCodexLogin` into bot options; wire to codex_auth.
- **Change:** `identity_bridge/paths.js` — Path for Codex credentials file; document in audit tree and identity docs.
- **Change:** `package.json` — Add `@mariozechner/pi-ai`.
- **Docs:** DEPLOY or audit section on "Codex OAuth via Telegram" and re-generating URL when expired.

## 6. Security and UX

- Only owner chat can complete Codex login.
- Do not log redirect URL (may contain tokens) in plaintext.
- Instruction: "Paste the **full** redirect URL (e.g. starting with https:// or http://localhost:...)."
