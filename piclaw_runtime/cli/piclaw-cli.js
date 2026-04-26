#!/usr/bin/env node
"use strict";

const lanInventory = require("../lan/inventory");
const lanTracker = require("../lan/tracker");
const devicesDiscover = require("../devices/discover");
const routerControl = require("../router/control");
const radio = require("../radio/mode_manager");
const caps = require("../introspection/capabilities");

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "";
  if (cmd === "lan" && args[1] === "list") {
    await lanTracker.tick();
    const inv = lanInventory.loadInventory();
    console.log(JSON.stringify(Object.values(inv.devices || {}), null, 2));
    return;
  }
  if (cmd === "lan" && args[1] === "show") {
    console.log(JSON.stringify(lanInventory.findDevice(args[2]), null, 2));
    return;
  }
  if (cmd === "devices" && args[1] === "refresh") {
    const out = await devicesDiscover.refreshAll();
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (cmd === "router" && args[1] === "status") {
    console.log(JSON.stringify(await routerControl.routerStatus(), null, 2));
    return;
  }
  if (cmd === "radio" && args[1] === "mode") {
    console.log(JSON.stringify(await radio.setMode(args[2]), null, 2));
    return;
  }
  if (cmd === "capabilities") {
    console.log(JSON.stringify(caps.getCapabilities(), null, 2));
    return;
  }
  console.log("usage: piclaw lan list|show <ip|mac> | devices refresh | router status | radio mode <idle|ap|monitor|client> | capabilities");
}

main().catch((e) => {
  console.error(e.message || String(e));
  process.exit(1);
});
