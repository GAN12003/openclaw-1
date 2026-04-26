"use strict";

const http = require("http");

function enabled() {
  return String(process.env.PICLAW_ROUTER_CONTROL_ENABLED || "0") === "1";
}

function baseHost() {
  return String(process.env.PICLAW_FRITZ_HOST || "fritz.box");
}

function user() {
  return String(process.env.PICLAW_FRITZ_USER || "");
}

function password() {
  return String(process.env.PICLAW_FRITZ_PASSWORD || "");
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    const auth = user() ? `${user()}:${password()}` : "";
    const opts = {
      hostname: baseHost(),
      port: 49000,
      path: pathname,
      method: "GET",
      headers: auth ? { Authorization: "Basic " + Buffer.from(auth).toString("base64") } : {},
      timeout: 8000,
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ code: res.statusCode || 0, body: data }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}

async function getStatus() {
  if (!enabled()) return { ok: false, reason: "router control disabled" };
  try {
    const r = await request("/tr64desc.xml");
    return { ok: r.code >= 200 && r.code < 300, http_code: r.code, host: baseHost() };
  } catch (e) {
    return { ok: false, reason: e.message || String(e) };
  }
}

module.exports = { enabled, getStatus };
