"use strict";

const https = require("https");

const MAX_HISTORY = 20; // last 20 messages (10 turns) for legacy chat(); Piclaw uses its own CHAT_HISTORY_LEN

/** Cap per-message text sent to the provider (tool outputs + history) to avoid huge prompts. */
function providerMessageMaxChars() {
  const n = parseInt(process.env.PICLAW_CHAT_PROVIDER_MSG_MAX_CHARS || "10000", 10);
  return Number.isFinite(n) ? Math.min(50000, Math.max(2000, n)) : 10000;
}

function capMessageForProvider(m) {
  if (!m || typeof m !== "object") return m;
  // Never truncate system: it is already capped in piclaw.js (PICLAW_SYSTEM_PROMPT_MAX_CHARS).
  // Truncating system here (default 10k) was cutting most instructions off and led to empty API choices.
  if (m.role === "system") return m;
  const max = providerMessageMaxChars();
  const out = { ...m };
  if (typeof out.content === "string" && out.content.length > max) {
    const over = out.content.length - max;
    out.content = out.content.slice(0, max) + `\n…[truncated ${over} chars for token budget]`;
  }
  return out;
}

/** OpenAI-compatible API base (no trailing slash). Piclaw defaults to NVIDIA NIM integrate API (free-tier models). */
const DEFAULT_OPENAI_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Default chat model on NVIDIA (override with OPENAI_CHAT_MODEL). */
const DEFAULT_CHAT_MODEL = "z-ai/glm4.7";

const REQUEST_TIMEOUT_MS = Math.min(
  300_000,
  Math.max(60_000, Number(process.env.OPENAI_REQUEST_TIMEOUT_MS) || 180_000)
);

function getChatCompletionsUrl() {
  const base = (
    process.env.OPENAI_BASE_URL ||
    process.env.OPENAI_API_BASE ||
    DEFAULT_OPENAI_BASE_URL
  )
    .trim()
    .replace(/\/$/, "");
  return new URL(`${base}/chat/completions`);
}

function requestOnce(body, apiKey) {
  return new Promise((resolve, reject) => {
    const raw = JSON.stringify(body);
    const url = getChatCompletionsUrl();
    const port = url.port ? Number(url.port) : 443;
    const req = https.request(
      {
        hostname: url.hostname,
        port,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Length": Buffer.byteLength(raw, "utf8"),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            const code = res.statusCode || 0;
            if (code === 429) {
              const ra = res.headers["retry-after"] || res.headers["Retry-After"];
              let delayMs = 12_000;
              if (ra != null && /^\d+$/.test(String(ra).trim())) {
                const sec = parseInt(String(ra).trim(), 10);
                if (Number.isFinite(sec)) {
                  delayMs = Math.min(120_000, Math.max(3000, sec * 1000));
                }
              }
              const err = new Error("HTTP 429 Too Many Requests");
              err.code = "RATE_LIMIT";
              err.retryAfterMs = delayMs;
              err.statusCode = 429;
              reject(err);
              return;
            }
            if (code < 200 || code >= 300) {
              const snippet = String(data || "").trim().slice(0, 800);
              reject(new Error(`HTTP ${code}${snippet ? ": " + snippet : ""}`));
              return;
            }
            const j = JSON.parse(data);
            if (j.error) {
              reject(new Error(j.error.message || "OpenAI error"));
              return;
            }
            resolve(j);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.write(raw);
    req.end();
  });
}

/**
 * POST chat/completions. Retries on HTTP 429 (NVIDIA free tier rate limits) with backoff.
 * Env: PICLAW_OPENAI_429_RETRIES = extra attempts after first 429 (default 5, max 12).
 */
async function request(body, apiKey) {
  const extra429 = Math.min(12, Math.max(0, parseInt(process.env.PICLAW_OPENAI_429_RETRIES || "5", 10) || 5));
  const max429Attempts = 1 + extra429;
  let attempt429 = 0;

  for (;;) {
    try {
      return await requestOnce(body, apiKey);
    } catch (err) {
      if (err && err.code === "RATE_LIMIT" && attempt429 < max429Attempts) {
        const base = err.retryAfterMs != null ? err.retryAfterMs : Math.min(120_000, 8000 + 6000 * attempt429);
        console.warn(
          "[piclaw] openai_chat: HTTP 429 from provider; backing off",
          base,
          "ms (attempt",
          attempt429 + 1,
          "/",
          max429Attempts,
          ")"
        );
        await new Promise((r) => setTimeout(r, base));
        attempt429++;
        continue;
      }
      if (err && err.code === "RATE_LIMIT") {
        throw new Error(
          "Rate limited (HTTP 429) by the AI API after several waits. Wait a few minutes, check NVIDIA quota at build.nvidia.com, or space out messages."
        );
      }
      const msg = (err && err.message) || "";
      const retryable = msg === "timeout" || msg.includes("socket hang up") || msg.includes("ECONNRESET");
      if (retryable) {
        return requestOnce(body, apiKey);
      }
      throw err;
    }
  }
}

async function requestAndLogUsage(body, apiKey) {
  const t0 = Date.now();
  const j = await request(body, apiKey);
  const duration_ms = Date.now() - t0;
  const rss_mb = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
  try {
    const { logChatCompletionUsage } = require("./chat_usage");
    logChatCompletionUsage(j && j.usage, { duration_ms, rss_mb });
  } catch (_) {}
  return j;
}

/** Some providers occasionally return 200 with no choices[0].message; retry before surfacing an error. */
async function requestCompletionUntilMessage(body, apiKey) {
  const parsed = parseInt(process.env.PICLAW_CHAT_EMPTY_RETRY || "3", 10);
  const maxAttempts = Number.isFinite(parsed) ? Math.min(5, Math.max(1, parsed)) : 3;
  let last = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const j = await requestAndLogUsage(body, apiKey);
    last = j;
    if (j.choices?.[0]?.message != null) return j;
    const fr = j.choices?.[0]?.finish_reason;
    const n = Array.isArray(j.choices) ? j.choices.length : 0;
    console.warn(
      "[piclaw] openai_chat: no assistant message in choices; retry",
      `${attempt + 1}/${maxAttempts}`,
      fr ? `finish_reason=${fr}` : "",
      `choices_len=${n}`
    );
    if (attempt + 1 < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return last;
}

/**
 * Call OpenAI Chat Completions with optional conversation history (memory).
 * @param {string} userMessage - User text.
 * @param {string} systemPrompt - System/context for the model.
 * @param {string} apiKey - OPENAI_API_KEY.
 * @param {Array<{role: string, content: string}>} [history] - Previous messages (user/assistant). Newest at end.
 * @returns {Promise<string>}
 */
function chat(userMessage, systemPrompt, apiKey, history = []) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-MAX_HISTORY),
    { role: "user", content: userMessage },
  ];
  return requestCompletionUntilMessage(
    {
      model: process.env.OPENAI_CHAT_MODEL || DEFAULT_CHAT_MODEL,
      max_tokens: 1024,
      messages,
    },
    apiKey
  ).then((j) => {
    const c = j.choices?.[0]?.message?.content?.trim();
    return (
      c ||
      "(The API returned no assistant text. Check OPENAI_API_KEY / model name / network, or try a shorter question.)"
    );
  });
}

/** Exec tool definition for OpenAI (run shell on this node). */
const EXEC_TOOL = {
  type: "function",
  function: {
    name: "exec",
    description: "Run a shell command on this Raspberry Pi node. Use for terminal access, running code, creating projects, or any action the user requests. Commands run in the Piclaw runtime directory.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Single shell command to run (e.g. ls -la, python3 -c 'print(1+1)', npm init -y).",
        },
      },
      required: ["command"],
    },
  },
};

/** Memory tool: store or recall a fact (long-term; persisted in identity knowledge topic 'memory'). */
const MEMORY_TOOL = {
  type: "function",
  function: {
    name: "memory",
    description:
      "Store or recall a fact. Use for user preferences, setup notes, or anything to remember across sessions. Stored under identity knowledge topic 'memory'. Optional category/tags on store for memory_search.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "store to save a fact, recall to retrieve by key.",
          enum: ["store", "recall"],
        },
        key: {
          type: "string",
          description: "Short key for the fact (e.g. 'user_tz', 'twitter_setup_done').",
        },
        value: {
          type: "string",
          description: "Value to store; required when action is store.",
        },
        category: {
          type: "string",
          description: "Optional category label for store (e.g. network, user_pref).",
        },
        tags: {
          type: "string",
          description: "Optional comma-separated tags for store (e.g. wifi,backup).",
        },
      },
      required: ["action", "key"],
    },
  },
};

/** Search stored knowledge (memory + learned_tools) by text/category/tag; bounded output. */
const MEMORY_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "memory_search",
    description:
      "Search identity knowledge (memory, learned_tools) by substring and optional filters. Returns labeled snippets with source paths — unverified vs live system state.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Words or phrase to search for in keys, values, tags.",
        },
        topics: {
          type: "string",
          description: "Comma-separated topics (default memory,learned_tools). Example: memory,learned_tools",
        },
        category: {
          type: "string",
          description: "Filter by category if entries have one.",
        },
        tag: {
          type: "string",
          description: "Filter by a single tag.",
        },
        max_results: {
          type: "number",
          description: "Max entries to return (default 12).",
        },
      },
      required: ["query"],
    },
  },
};

/** Semantic recall over embedded knowledge (optional; requires PICLAW_MEMORY_EMBEDDINGS_ENABLE). */
const MEMORY_RECALL_SEMANTIC_TOOL = {
  type: "function",
  function: {
    name: "memory_recall_semantic",
    description:
      "Find top similar stored knowledge by meaning (embeddings). Unverified — verify critical facts with exec/read_file. Disabled unless PICLAW_MEMORY_EMBEDDINGS_ENABLE=1.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language query.",
        },
        topics: {
          type: "string",
          description: "Comma-separated topics (default memory,learned_tools).",
        },
        top_k: {
          type: "number",
          description: "Number of hits (default 5).",
        },
      },
      required: ["query"],
    },
  },
};

/** Read a file under runtime or identity directory (path-safe). */
const READ_FILE_TOOL = {
  type: "function",
  function: {
    name: "read_file",
    description: "Read a file under the Piclaw runtime directory or identity directory (/opt/piclaw_identity). Use for extensions code or docs. Path is relative to runtime root or identity root.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path to file (e.g. extensions/twitter_api/README.md or knowledge/learned_tools.json under identity).",
        },
      },
      required: ["path"],
    },
  },
};

const PICLAW_CLI_TOOL = {
  type: "function",
  function: {
    name: "piclaw_cli",
    description: "Run allow-listed local piclaw CLI commands (lan/devices/router/radio/capabilities).",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "CLI args after 'piclaw', e.g. 'lan list'." },
      },
      required: ["command"],
    },
  },
};

/** Learn tool: store a procedure in learned_tools so it can be recalled later (injected into system prompt). */
const LEARN_TOOL = {
  type: "function",
  function: {
    name: "learn",
    description: "Store a procedure or fact in learned_tools. It will appear in your context on future turns. Use for steps the user taught you or reusable procedures.",
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Short name for the procedure (e.g. 'deploy_steps', 'backup_command').",
        },
        value: {
          type: "string",
          description: "Description or steps (text).",
        },
      },
      required: ["key", "value"],
    },
  },
};

/** Set the one-line self-summary (persistent 'who I am' in meta.json; injected at top of context). */
const SET_SELF_SUMMARY_TOOL = {
  type: "function",
  function: {
    name: "set_self_summary",
    description: "Set your one-line self-summary. It is stored in identity meta and shown at the top of your context. Use when the user asks you to define who you are in one sentence.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "One sentence describing who you are (e.g. 'I am Piclaw on host X; my mission is Y'). Max 500 chars.",
        },
      },
      required: ["summary"],
    },
  },
};

/** Set writing/communication style (tone, formality, length). Stored in identity meta; injected into system prompt so you follow it in all replies. Use when the user asks you to change how you write (e.g. more formal, casual, shorter, technical). */
const SET_WRITING_STYLE_TOOL = {
  type: "function",
  function: {
    name: "set_writing_style",
    description: "Set how you should write replies: tone, formality, length. Use when the user says to write more formally, casually, concisely, technically, or to change your style. Stored in identity and applied to all future replies.",
    parameters: {
      type: "object",
      properties: {
        style: {
          type: "string",
          description: "Short description of writing style (e.g. 'Concise and technical.', 'Friendly and casual.', 'Formal and brief.'). Max 500 chars.",
        },
      },
      required: ["style"],
    },
  },
};

/**
 * Chat with tools (OpenClaw-style agent loop). Runs until the model returns a final text reply (no more tool_calls).
 * @param {Array<object>} messages - Full messages array (system + history + user). Will be mutated with tool results.
 * @param {string} apiKey
 * @param {function(string, object): Promise<string>} executeTool - (name, args) => content string for tool result.
 * @returns {Promise<string>} Final assistant content.
 */
async function chatWithTools(messages, apiKey, executeTool) {
  const tools = [
    EXEC_TOOL,
    MEMORY_TOOL,
    MEMORY_SEARCH_TOOL,
    MEMORY_RECALL_SEMANTIC_TOOL,
    READ_FILE_TOOL,
    PICLAW_CLI_TOOL,
    LEARN_TOOL,
    SET_SELF_SUMMARY_TOOL,
    SET_WRITING_STYLE_TOOL,
  ];
  const parsed = parseInt(process.env.PICLAW_CHAT_MAX_TOOL_ROUNDS || "8", 10);
  const maxRounds = Number.isFinite(parsed) ? Math.min(32, Math.max(4, parsed)) : 8;
  let round = 0;

  while (round < maxRounds) {
    const cappedMessages = messages.map(capMessageForProvider);
    const body = {
      model: process.env.OPENAI_CHAT_MODEL || DEFAULT_CHAT_MODEL,
      max_tokens: 1024,
      messages: cappedMessages,
      tools,
      tool_choice: "auto",
    };
    const j = await requestCompletionUntilMessage(body, apiKey);
    const msg = j.choices?.[0]?.message;
    if (!msg) {
      const fr = j.choices?.[0]?.finish_reason;
      console.warn(
        "[piclaw] openai_chat: no assistant message in response",
        fr ? `finish_reason=${fr}` : ""
      );
      return "(The API returned no assistant message. Check OPENAI_API_KEY / model id / network. If usage is high, lower PICLAW_SYSTEM_PROMPT_MAX_CHARS or PICLAW_CHAT_HISTORY_MESSAGES.)";
    }

    const content = msg.content?.trim();
    const toolCalls = msg.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: content || null,
        tool_calls: toolCalls,
      });
      for (const tc of toolCalls) {
        const name = tc.function?.name || "exec";
        let args = {};
        try {
          if (tc.function?.arguments) args = JSON.parse(tc.function.arguments);
        } catch (_) {}
        let toolResult;
        try {
          toolResult = await executeTool(name, args);
        } catch (e) {
          toolResult = "error: " + String(e.message);
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
        });
      }
      round++;
      continue;
    }

    // Some models paste XML-style tool tags in `content` instead of using tool_calls; that would leak as a "code" reply.
    const rawContent = msg.content != null ? String(msg.content) : "";
    if (rawContent && /<\s*tool[\s_-]*call\b/i.test(rawContent)) {
      messages.push({ role: "assistant", content: rawContent.trim() || null });
      messages.push({
        role: "user",
        content:
          "Do not output XML or <tool_call> markup. Use native function calling only (exec, memory, …). After tools return, summarize the outcome in plain text for the user.",
      });
      round++;
      continue;
    }

    return (
      content ||
      "(The model returned no text after tools finished. Try a simpler question, or raise PICLAW_CHAT_MAX_TOOL_ROUNDS in .env.)"
    );
  }

  return (
    "(agent loop limit reached — try a narrower question, or raise PICLAW_CHAT_MAX_TOOL_ROUNDS up to 32 in .env and restart.)"
  );
}

module.exports = {
  chat,
  chatWithTools,
  EXEC_TOOL,
  MEMORY_TOOL,
  MEMORY_SEARCH_TOOL,
  MEMORY_RECALL_SEMANTIC_TOOL,
  READ_FILE_TOOL,
  PICLAW_CLI_TOOL,
  LEARN_TOOL,
  SET_SELF_SUMMARY_TOOL,
  SET_WRITING_STYLE_TOOL,
};
