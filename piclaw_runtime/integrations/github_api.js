"use strict";

/**
 * GitHub read-only auth verification. No writes.
 * Uses built-in fetch (Node 18+). Works on Pi and Windows.
 */

const GITHUB_USER = "https://api.github.com/user";
const GITHUB_RATE = "https://api.github.com/rate_limit";

const HEADERS = {
  "User-Agent": "piclaw",
  Accept: "application/vnd.github+json",
};

async function getGitHubAuthStatus() {
  const pat = process.env.PICLAW_GITHUB_PAT;
  if (!pat || !pat.trim()) {
    return { configured: false, ok: false, reason: "missing_pat" };
  }

  const authHeaders = { ...HEADERS, Authorization: `token ${pat.trim()}` };

  let login = null;
  let id = null;
  let name = null;
  let ok = false;
  let reason = null;
  let rateLimitRemaining = null;

  try {
    const userRes = await fetch(GITHUB_USER, { headers: authHeaders });
    const userData = await userRes.json().catch(() => ({}));

    if (!userRes.ok) {
      reason = userData.message || `HTTP ${userRes.status}`;
      return {
        configured: true,
        ok: false,
        login: userData.login || null,
        id: userData.id ?? null,
        name: userData.name ?? null,
        rate_limit_remaining: null,
        reason,
      };
    }

    login = userData.login || null;
    id = userData.id ?? null;
    name = userData.name ?? null;
    ok = true;
  } catch (err) {
    reason = err.message || "request_failed";
    return {
      configured: true,
      ok: false,
      login: null,
      id: null,
      name: null,
      rate_limit_remaining: null,
      reason,
    };
  }

  try {
    const rateRes = await fetch(GITHUB_RATE, { headers: authHeaders });
    const rateData = await rateRes.json().catch(() => ({}));
    const core = rateData.resources?.core ?? rateData.rate;
    rateLimitRemaining = core != null && typeof core.remaining === "number" ? core.remaining : null;
  } catch (_) {}

  return {
    configured: true,
    ok,
    login,
    id,
    name,
    rate_limit_remaining: rateLimitRemaining,
    reason: null,
  };
}

module.exports = { getGitHubAuthStatus };
