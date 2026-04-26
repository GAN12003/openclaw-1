"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const TelegramBot = require("node-telegram-bot-api");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const HMAC_SECRET = String(process.env.NOTIFIER_HMAC_SECRET || "");
const TELEGRAM_TOKEN = String(process.env.NOTIFIER_TELEGRAM_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = String(process.env.NOTIFIER_TELEGRAM_CHAT_ID || "").trim();
const DATA_FILE = path.join(__dirname, "data", "events.ndjson");

const bot = TELEGRAM_TOKEN ? new TelegramBot(TELEGRAM_TOKEN, { polling: false }) : null;

function verifySignature(body, sigHex) {
  if (!HMAC_SECRET) return true;
  const expected = crypto.createHmac("sha256", HMAC_SECRET).update(body).digest("hex");
  return sigHex && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(sigHex)));
}

function appendEvent(ev) {
  const dir = path.dirname(DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(DATA_FILE, JSON.stringify(ev) + "\n", "utf8");
}

function formatTelegram(ev) {
  const sev = String(ev.severity || "info").toUpperCase();
  return `[${sev}] ${ev.topic || "event"}\n${ev.summary || ""}\nagent=${ev.agent_id || "unknown"} ts=${ev.ts || ""}`;
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/event") {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  let body = "";
  req.on("data", (c) => {
    body += c.toString("utf8");
    if (body.length > 1024 * 1024) req.destroy(new Error("too large"));
  });
  req.on("end", async () => {
    try {
      const sig = req.headers["x-piclaw-signature"];
      if (!verifySignature(body, sig)) {
        res.statusCode = 401;
        res.end("bad signature");
        return;
      }
      const ev = JSON.parse(body || "{}");
      appendEvent(ev);
      if (bot && TELEGRAM_CHAT_ID) {
        await bot.sendMessage(TELEGRAM_CHAT_ID, formatTelegram(ev)).catch(() => {});
      }
      res.statusCode = 200;
      res.end("ok");
    } catch (e) {
      res.statusCode = 500;
      res.end(e.message || "error");
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[piclaw-notifier] listening on http://${HOST}:${PORT}`);
});
