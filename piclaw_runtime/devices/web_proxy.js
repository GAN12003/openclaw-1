"use strict";

const express = require("express");
const inventory = require("../lan/inventory");

let server = null;

function start() {
  if (server) return server;
  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/cameras", (_req, res) => {
    const inv = inventory.loadInventory();
    const cams = Object.values(inv.devices || {}).filter((d) => (d.last_protocols || []).includes("rtsp"));
    res.json({ cameras: cams });
  });
  const port = Number(process.env.PICLAW_DEVICE_WEB_PORT || 8088);
  const host = process.env.PICLAW_DEVICE_WEB_HOST || "127.0.0.1";
  server = app.listen(port, host, () => {
    console.log(`[piclaw] device web proxy listening on http://${host}:${port}`);
  });
  return server;
}

module.exports = { start };
