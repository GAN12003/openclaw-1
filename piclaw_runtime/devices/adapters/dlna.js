"use strict";
async function play(device, url) {
  return { ok: true, device, url, note: "dlna adapter scaffold" };
}
module.exports = { play };
