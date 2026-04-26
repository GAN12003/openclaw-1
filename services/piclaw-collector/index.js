"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || "127.0.0.1";
const SECRET = String(process.env.COLLECTOR_HMAC_SECRET || "");
const INBOX = path.join(__dirname, "inbox");

function verify(body, sigHex) {
  if (!SECRET) return true;
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  return sigHex && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(sigHex)));
}

function safePart(v, fallback) {
  const s = String(v || fallback || "unknown");
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/upload") {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  let body = "";
  req.on("data", (c) => {
    body += c.toString("utf8");
    if (body.length > 5 * 1024 * 1024) req.destroy(new Error("too large"));
  });
  req.on("end", () => {
    try {
      const sig = req.headers["x-piclaw-signature"];
      if (!verify(body, sig)) {
        res.statusCode = 401;
        res.end("bad signature");
        return;
      }
      const payload = JSON.parse(body || "{}");
      const agent = safePart(payload.agent_id, "agent");
      const topic = safePart(payload.topic, "misc");
      const ts = safePart(payload.ts || new Date().toISOString(), Date.now());
      const dir = path.join(INBOX, agent, topic);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${ts}.json`), JSON.stringify(payload, null, 2), "utf8");
      res.statusCode = 200;
      res.end("ok");
    } catch (e) {
      res.statusCode = 500;
      res.end(e.message || "error");
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[piclaw-collector] listening on http://${HOST}:${PORT}`);
});
