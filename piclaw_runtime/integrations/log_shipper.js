"use strict";

const crypto = require("crypto");
const http = require("http");
const https = require("https");
const identityBridge = require("../identity_bridge");

function postJson(urlRaw, payload, secret) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(urlRaw);
    const sig = secret ? crypto.createHmac("sha256", secret).update(body).digest("hex") : "";
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : isHttps ? 443 : 80,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body, "utf8"),
          "x-piclaw-signature": sig,
        },
        timeout: 12000,
      },
      (res) => {
        if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300) resolve(true);
        else reject(new Error(`collector http ${res.statusCode || 0}`));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.write(body);
    req.end();
  });
}

async function shipOnce(topic, data) {
  const url = String(process.env.PICLAW_COLLECTOR_URL || "").trim();
  if (!url) return { ok: false, reason: "collector url missing" };
  const secret = String(process.env.PICLAW_COLLECTOR_HMAC_SECRET || "");
  const payload = {
    ts: new Date().toISOString(),
    topic: topic || "misc",
    agent_id: process.env.PICLAW_NOTIFIER_AGENT_ID || process.env.HOSTNAME || "piclaw",
    data,
  };
  await postJson(url, payload, secret);
  return { ok: true };
}

async function shipLedgerTail(lines = 120) {
  const data = identityBridge.loadLedgerTail(lines);
  return shipOnce("ledger", data);
}

function startSchedule() {
  const ms = Math.max(60_000, Number(process.env.PICLAW_LOG_SHIP_INTERVAL_MS || 3600000) || 3600000);
  setInterval(() => {
    shipLedgerTail().catch(() => {});
  }, ms);
}

module.exports = { shipOnce, shipLedgerTail, startSchedule };
