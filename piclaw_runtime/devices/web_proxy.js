"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const inventory = require("../lan/inventory");
const deviceControl = require("./control");

let server = null;
const streams = new Map();

function streamToken() {
  return String(process.env.PICLAW_STREAM_TOKEN || "").trim();
}

function requireToken(req, res, next) {
  const token = streamToken();
  if (!token) return next();
  if (String(req.query.t || "") === token) return next();
  res.status(401).json({ ok: false, reason: "missing/invalid stream token" });
}

function cameraCandidates() {
  const inv = inventory.loadInventory();
  return Object.values(inv.devices || {}).filter((d) => (d.last_protocols || []).includes("rtsp"));
}

function idForDevice(d) {
  return String(d.mac || d.ip || "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function streamRoot() {
  return path.join(os.tmpdir(), "piclaw-hls");
}

function streamDir(cameraId) {
  return path.join(streamRoot(), cameraId);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function startHls(cameraId, rtspUrl) {
  const existing = streams.get(cameraId);
  if (existing && !existing.proc.killed) return existing;
  const dir = streamDir(cameraId);
  ensureDir(dir);
  const indexPath = path.join(dir, "index.m3u8");
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-rtsp_transport",
    "tcp",
    "-i",
    rtspUrl,
    "-map",
    "0:v:0",
    "-c:v",
    "copy",
    "-an",
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "8",
    "-hls_flags",
    "delete_segments+append_list",
    indexPath,
  ];
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  let lastErr = "";
  proc.stderr.on("data", (buf) => {
    lastErr = String(buf || "").trim().slice(-400);
  });
  proc.on("exit", () => {
    streams.delete(cameraId);
  });
  const rec = { proc, dir, indexPath, rtspUrl, startedAt: Date.now(), lastErr };
  streams.set(cameraId, rec);
  return rec;
}

function publicBaseUrl() {
  const raw = String(process.env.PICLAW_DEVICE_WEB_PUBLIC_BASE_URL || "").trim();
  if (raw) return raw.replace(/\/$/, "");
  const host = process.env.PICLAW_DEVICE_WEB_HOST || "127.0.0.1";
  const port = Number(process.env.PICLAW_DEVICE_WEB_PORT || 8088);
  return `http://${host}:${port}`;
}

function cameraPageHtml(cameraId, m3u8Url) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Camera ${cameraId}</title></head>
<body>
  <h2>Camera ${cameraId}</h2>
  <video id="v" controls autoplay muted playsinline style="max-width:100%;height:auto;"></video>
  <p>Stream URL: <code>${m3u8Url}</code></p>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <script>
    const url = ${JSON.stringify(m3u8Url)};
    const video = document.getElementById('v');
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    } else if (window.Hls && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      document.body.insertAdjacentHTML('beforeend', '<p>HLS not supported in this browser.</p>');
    }
  </script>
</body></html>`;
}

function start() {
  if (server) return server;
  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/cameras", requireToken, (_req, res) => {
    const cams = cameraCandidates().map((d) => {
      const id = idForDevice(d);
      return {
        id,
        ip: d.ip || "",
        names: d.names || [],
        url: `${publicBaseUrl()}/camera/${encodeURIComponent(id)}${streamToken() ? `?t=${encodeURIComponent(streamToken())}` : ""}`,
      };
    });
    const listHtml = cams
      .map((c) => `<li><b>${c.id}</b> (${c.ip}) - <a href="${c.url}">open stream</a></li>`)
      .join("");
    res.type("html").send(`<!doctype html><html><body><h2>Cameras</h2><ul>${listHtml || "<li>No RTSP cameras detected.</li>"}</ul></body></html>`);
  });
  app.get("/camera/:id", requireToken, (req, res) => {
    const camId = String(req.params.id || "");
    const cam = cameraCandidates().find((d) => idForDevice(d) === camId);
    if (!cam) {
      res.status(404).send("camera not found");
      return;
    }
    const r = deviceControl.cameraStream(camId);
    if (!r.ok || !r.url) {
      res.status(400).send(`cannot resolve stream: ${r.reason || "unknown"}`);
      return;
    }
    const job = startHls(camId, r.url);
    const m3u8 = `${publicBaseUrl()}/hls/${encodeURIComponent(camId)}/index.m3u8${streamToken() ? `?t=${encodeURIComponent(streamToken())}` : ""}`;
    if (job.lastErr) {
      // Keep serving page; error text appears if ffmpeg cannot pull source.
      console.warn("[piclaw] camera stream warning:", job.lastErr);
    }
    res.type("html").send(cameraPageHtml(camId, m3u8));
  });
  app.get("/hls/:id/:file", requireToken, (req, res) => {
    const camId = String(req.params.id || "");
    const file = String(req.params.file || "");
    if (!/^[a-zA-Z0-9._-]+$/.test(file)) {
      res.status(400).json({ ok: false, reason: "bad file" });
      return;
    }
    const full = path.join(streamDir(camId), file);
    if (!full.startsWith(streamDir(camId))) {
      res.status(400).json({ ok: false, reason: "bad path" });
      return;
    }
    if (!fs.existsSync(full)) {
      const cam = cameraCandidates().find((d) => idForDevice(d) === camId);
      if (cam) {
        const r = deviceControl.cameraStream(camId);
        if (r.ok && r.url) startHls(camId, r.url);
      }
      res.status(404).json({ ok: false, reason: "not ready" });
      return;
    }
    if (file.endsWith(".m3u8")) res.type("application/vnd.apple.mpegurl");
    if (file.endsWith(".ts")) res.type("video/mp2t");
    res.sendFile(full);
  });
  const port = Number(process.env.PICLAW_DEVICE_WEB_PORT || 8088);
  const host = process.env.PICLAW_DEVICE_WEB_HOST || "127.0.0.1";
  server = app.listen(port, host, () => {
    console.log(`[piclaw] device web proxy listening on http://${host}:${port}`);
  });
  return server;
}

module.exports = { start };
