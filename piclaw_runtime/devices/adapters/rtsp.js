"use strict";
function streamUrl(device) {
  const ip = device && device.ip ? String(device.ip) : "";
  return ip ? `rtsp://${ip}:554/` : "";
}
module.exports = { streamUrl };
