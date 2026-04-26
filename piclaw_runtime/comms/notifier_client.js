"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const https = require("https");

const identityBridge = require("../identity_bridge");

let queue = [];
let timer = null;
let flushing = false;

function outboxPath() {
  return path.join(identityBridge.getRoot(), "notifier_outbox.ndjson");
}

function loadOutbox() {
  try {
    const raw = fs.readFileSync(outboxPath(), "utf8");
    queue = raw.split(/\r?\n/).filter(Boolean).map((x) => JSON.parse(x));
  } catch (_) {
    queue = [];
  }
}

function persistOutbox() {
  try {
    const p = outboxPath();
    const dir = path.dirname(p);
    fs.mkdirSync(dir, { recursive: true });
    const body = queue.map((x) => JSON.stringify(x)).join("\n");
    fs.writeFileSync(p, body ? `${body}\n` : "", "utf8");
  } catch (_) {}
}

function signBody(secret, body) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function postJson(urlRaw, payload) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlRaw);
    } catch (e) {
      reject(e);
      return;
    }
    const body = JSON.stringify(payload);
    const secret = String(process.env.PICLAW_NOTIFIER_HMAC_SECRET || "");
    const sig = secret ? signBody(secret, body) : "";
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;
    const req = transport.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port ? Number(url.port) : isHttps ? 443 : 80,
        path: url.pathname + url.search,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body, "utf8"),
          "x-piclaw-signature": sig,
        },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300) resolve(data || "ok");
          else reject(new Error(`notifier http ${res.statusCode || 0}`));
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("notifier timeout")));
    req.write(body);
    req.end();
  });
}

async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    const endpoint = String(process.env.PICLAW_NOTIFIER_URL || "").trim();
    if (!endpoint || queue.length === 0) return;
    const next = [];
    for (const ev of queue) {
      try {
        await postJson(endpoint, ev);
      } catch (_) {
        next.push(ev);
      }
    }
    queue = next;
    persistOutbox();
  } finally {
    flushing = false;
  }
}

function ensureStarted() {
  if (timer) return;
  loadOutbox();
  const intervalMs = Math.max(3000, Number(process.env.PICLAW_NOTIFIER_FLUSH_MS || 8000) || 8000);
  timer = setInterval(() => {
    flushQueue().catch(() => {});
  }, intervalMs);
}

function enqueueEvent(event) {
  ensureStarted();
  queue.push(event);
  persistOutbox();
}

module.exports = { enqueueEvent, flushQueue, ensureStarted };
