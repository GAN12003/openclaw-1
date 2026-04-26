"use strict";
async function listProfiles(device) {
  return { ok: true, device, profiles: [], note: "onvif adapter scaffold" };
}
module.exports = { listProfiles };
