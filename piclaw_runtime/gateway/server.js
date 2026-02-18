"use strict";

const express = require("express");
const auth = require("./auth");
const gatewayApi = require("../api/gateway_api");
const identityBridge = require("../identity_bridge");

const PORT = parseInt(process.env.PICLAW_GATEWAY_PORT || "3180", 10);
const token = (process.env.PICLAW_TELEGRAM_TOKEN || "").trim();

function getAllowedOwner() {
  if (process.env.PICLAW_MINI_APP_OWNER_TELEGRAM_ID) {
    return process.env.PICLAW_MINI_APP_OWNER_TELEGRAM_ID.trim();
  }
  if (identityBridge.isAvailable()) {
    const self = identityBridge.loadSelf();
    const owner = self?.owner;
    return typeof owner === "string" ? owner.trim() : "";
  }
  return "";
}

function getInitData(req) {
  const header = req.get("X-Telegram-Init-Data") || req.get("x-telegram-init-data");
  if (header) return header;
  if (req.query && typeof req.query.initData === "string") return req.query.initData;
  if (req.body && typeof req.body.initData === "string") return req.body.initData;
  return null;
}

function authMiddleware(req, res, next) {
  if (!token) {
    return res.status(503).json({ error: "gateway_unconfigured", reason: "PICLAW_TELEGRAM_TOKEN not set" });
  }
  const initData = getInitData(req);
  if (!initData) {
    return res.status(401).json({ error: "unauthorized", reason: "missing_init_data" });
  }
  const allowed = auth.isAllowed(initData, token, getAllowedOwner());
  if (!allowed.allowed) {
    const status = allowed.reason === "owner_mismatch" ? 403 : 401;
    return res.status(status).json({ error: allowed.reason === "owner_mismatch" ? "forbidden" : "unauthorized", reason: allowed.reason });
  }
  next();
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-Telegram-Init-Data");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(authMiddleware);

app.get("/status", async (req, res) => {
  try {
    const data = await gatewayApi.getStatusJson();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "internal_error", reason: err.message || "status failed" });
  }
});

app.get("/devices", (req, res) => {
  try {
    const devices = gatewayApi.getDevices();
    res.json({ devices });
  } catch (err) {
    res.status(500).json({ error: "internal_error", reason: err.message || "devices failed" });
  }
});

app.get("/review", (req, res) => {
  try {
    const review = gatewayApi.getReview();
    res.json(review != null ? review : {});
  } catch (err) {
    res.status(500).json({ error: "internal_error", reason: err.message || "review failed" });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "not_found", reason: "unknown path" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[piclaw-gateway] listening on port ${PORT}`);
});
