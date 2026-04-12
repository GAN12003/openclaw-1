"use strict";

/**
 * Optional semantic recall over knowledge (OpenAI-compatible embeddings HTTP).
 * Env: PICLAW_MEMORY_EMBEDDINGS_ENABLE=1, PICLAW_EMBEDDING_MODEL (default text-embedding-3-small)
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const paths = require("../identity_bridge/paths");

const DEFAULT_MODEL = "text-embedding-3-small";
const MAX_ENTRIES = 400;

function envBool(key) {
  const v = process.env[key];
  if (v === undefined || v === "") return false;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}

function storePath() {
  return path.join(paths.getRoot(), "knowledge", "vector_memory.json");
}

function loadStore() {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return { entries: [] };
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j && Array.isArray(j.entries) ? j : { entries: [] };
  } catch (_) {
    return { entries: [] };
  }
}

function saveStore(data) {
  const p = storePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const entries = (data.entries || []).slice(-MAX_ENTRIES);
  fs.writeFileSync(p, JSON.stringify({ entries }, null, 2), "utf8");
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 0 ? dot / d : 0;
}

function getEmbeddingUrl() {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, "");
  return new URL(`${base}/embeddings`);
}

/**
 * @param {string} text
 * @returns {Promise<number[] | null>}
 */
function fetchEmbedding(text) {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return Promise.resolve(null);
  const model = (process.env.PICLAW_EMBEDDING_MODEL || DEFAULT_MODEL).trim();
  const url = getEmbeddingUrl();
  const body = JSON.stringify({ model, input: text.slice(0, 8000) });
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Length": Buffer.byteLength(body, "utf8"),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => {
          try {
            if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
              resolve(null);
              return;
            }
            const j = JSON.parse(data);
            const emb = j.data && j.data[0] && j.data[0].embedding;
            if (Array.isArray(emb)) resolve(emb.map(Number));
            else resolve(null);
          } catch (_) {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.setTimeout(45000, () => {
      req.destroy();
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

/**
 * @param {string} topic
 * @param {string} key
 * @param {string} text
 */
async function onKnowledgeUpsert(topic, key, text) {
  if (!envBool("PICLAW_MEMORY_EMBEDDINGS_ENABLE")) return;
  const t = String(text || "").trim();
  if (!t) return;
  const emb = await fetchEmbedding(`${topic}:${key}:${t}`);
  if (!emb) return;
  const st = loadStore();
  const id = `${topic}::${key}`;
  st.entries = (st.entries || []).filter((e) => e.id !== id);
  st.entries.push({
    id,
    topic,
    key,
    text: t.slice(0, 2000),
    embedding: emb,
    updated_at: new Date().toISOString(),
  });
  saveStore(st);
}

/**
 * @param {{ query: string, topics?: string[], topK?: number, maxChars?: number }} opts
 * @returns {Promise<string>}
 */
async function recallSemantic(opts) {
  if (!envBool("PICLAW_MEMORY_EMBEDDINGS_ENABLE")) {
    return "memory_recall_semantic: set PICLAW_MEMORY_EMBEDDINGS_ENABLE=1 and ensure OPENAI_API_KEY works with your embedding endpoint.";
  }
  const q = (opts && opts.query ? String(opts.query) : "").trim();
  if (!q) return "memory_recall_semantic: query is required.";
  const topK = Math.min(20, Math.max(1, Number(opts.topK) || 5));
  const maxChars = Math.min(8000, Math.max(500, Number(opts.maxChars) || 4000));
  const topics = Array.isArray(opts.topics) && opts.topics.length ? opts.topics : ["memory", "learned_tools"];

  const qEmb = await fetchEmbedding(q);
  if (!qEmb) return "memory_recall_semantic: could not embed query (check API).";

  const st = loadStore();
  const rows = (st.entries || []).filter((e) => topics.some((t) => e.topic === t));
  const scored = rows
    .map((e) => ({ e, score: cosine(qEmb, e.embedding || []) }))
    .filter((x) => x.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (scored.length === 0) return "memory_recall_semantic: no similar stored entries (unverified memory).";

  const lines = [];
  let n = 0;
  for (const { e, score } of scored) {
    const block = `[semantic unverified source=${e.topic} key=${e.key} score=${score.toFixed(3)}]\n${e.text}\n---`;
    if (n + block.length > maxChars) break;
    lines.push(block);
    n += block.length;
  }
  return lines.join("\n");
}

module.exports = { onKnowledgeUpsert, recallSemantic, fetchEmbedding, cosine };
