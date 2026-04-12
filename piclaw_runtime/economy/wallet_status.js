"use strict";

const DEFAULT_ETH_RPC = "https://cloudflare-eth.com";
const DEFAULT_POLYGON_RPC = "https://polygon-rpc.com";
const DEFAULT_SOLANA_RPC = "https://api.mainnet-beta.solana.com";

function signingEnabled() {
  return String(process.env.PICLAW_WALLET_SIGNING_ENABLED || "").trim() === "1";
}

function hasEthKey() {
  return !!(process.env.PICLAW_WALLET_ETH_PRIVATE_KEY && process.env.PICLAW_WALLET_ETH_PRIVATE_KEY.trim());
}

function hasSolKey() {
  return !!(process.env.PICLAW_WALLET_SOLANA_PRIVATE_KEY && process.env.PICLAW_WALLET_SOLANA_PRIVATE_KEY.trim());
}

/**
 * Polygon observation only: public address + balance via RPC. Never loads private keys for signing here.
 */
function getWalletStatus() {
  const address = process.env.PICLAW_WALLET_ADDRESS;
  const label = process.env.PICLAW_WALLET_LABEL;
  const eth = (process.env.PICLAW_WALLET_ETH_ADDRESS || "").trim();
  const poly = (process.env.PICLAW_WALLET_POLYGON_ADDRESS || "").trim();
  const sol = (process.env.PICLAW_WALLET_SOLANA_ADDRESS || "").trim();
  const evm = eth || (address && String(address).trim().startsWith("0x") ? String(address).trim() : "");
  const addressKnown = !!(evm || poly || sol || (address && address.trim()));
  const gate = signingEnabled();
  return {
    address_known: addressKnown,
    label: (label && label.trim()) || null,
    signing_enabled: gate && (hasEthKey() || hasSolKey()),
    mode: gate ? "signing_opt_in_configured" : "observation_only",
    eth_address: evm || null,
    polygon_address: poly || evm || null,
    solana_address: sol || null,
  };
}

function isHexAddr(s) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(s || "").trim());
}

async function rpcEthGetBalance(rpcUrl, address) {
  const url = (rpcUrl || DEFAULT_ETH_RPC).trim();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [address, "latest"],
    }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json().catch(() => ({}));
  const hex = j && j.result;
  if (typeof hex !== "string" || !hex.startsWith("0x")) return null;
  const wei = BigInt(hex);
  const eth = Number(wei) / 1e18;
  if (!Number.isFinite(eth)) return null;
  return eth.toFixed(6);
}

async function rpcSolBalance(rpcUrl, address) {
  const url = (rpcUrl || DEFAULT_SOLANA_RPC).trim();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address],
    }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json().catch(() => ({}));
  const lamports =
    j && j.result != null && typeof j.result === "object" && typeof j.result.value === "number"
      ? j.result.value
      : typeof j?.result === "number"
        ? j.result
        : null;
  if (typeof lamports !== "number") return null;
  const sol = lamports / 1e9;
  return sol.toFixed(6);
}

/**
 * Short HTML lines for /status Economy block (balances best-effort).
 * @returns {Promise<string[]>}
 */
async function getWalletBalanceLinesHtml() {
  const st = getWalletStatus();
  const lines = [];
  const ethRpc = (process.env.PICLAW_RPC_ETH_URL || DEFAULT_ETH_RPC).trim();
  const polyRpc = (process.env.PICLAW_RPC_POLYGON_URL || DEFAULT_POLYGON_RPC).trim();
  const solRpc = (process.env.PICLAW_RPC_SOLANA_URL || DEFAULT_SOLANA_RPC).trim();

  if (st.eth_address && isHexAddr(st.eth_address)) {
    try {
      const b = await rpcEthGetBalance(ethRpc, st.eth_address);
      lines.push(`ETH bal: ${b != null ? b : "n/a"} (native)`);
    } catch (_) {
      lines.push("ETH bal: probe failed");
    }
  }
  const polyAddr = st.polygon_address && isHexAddr(st.polygon_address) ? st.polygon_address : null;
  if (polyAddr) {
    try {
      const b = await rpcEthGetBalance(polyRpc, polyAddr);
      lines.push(`Polygon bal: ${b != null ? b : "n/a"} (POL)`);
    } catch (_) {
      lines.push("Polygon bal: probe failed");
    }
  }
  if (st.solana_address && String(st.solana_address).length >= 32) {
    try {
      const b = await rpcSolBalance(solRpc, st.solana_address);
      lines.push(`Solana bal: ${b != null ? b : "n/a"} (SOL)`);
    } catch (_) {
      lines.push("Solana bal: probe failed");
    }
  }

  if (signingEnabled()) {
    lines.push(
      "Wallet signing: <b>opt-in ON</b> — keys present in env; Piclaw does not spend them in this build (use exec + external tools if needed)."
    );
  }
  return lines;
}

module.exports = { getWalletStatus, getWalletBalanceLinesHtml };
