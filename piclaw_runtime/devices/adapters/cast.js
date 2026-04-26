"use strict";
async function play(device, url) {
  return { ok: true, device, url, note: "cast adapter scaffold" };
}
module.exports = { play };
