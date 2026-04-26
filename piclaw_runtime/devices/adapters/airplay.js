"use strict";
async function play(device, url) {
  return { ok: true, device, url, note: "airplay adapter scaffold" };
}
module.exports = { play };
