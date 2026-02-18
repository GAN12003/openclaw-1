"use strict";

/**
 * Polygon (or other) wallet identity — observation only.
 * Never load or use private keys. Only public address + label from env.
 */
function getWalletStatus() {
  const address = process.env.PICLAW_WALLET_ADDRESS;
  const label = process.env.PICLAW_WALLET_LABEL;
  const addressKnown = !!(address && address.trim());
  return {
    address_known: addressKnown,
    label: (label && label.trim()) || null,
    signing_enabled: false,
    mode: "observation_only",
  };
}

module.exports = { getWalletStatus };
