import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const require = createRequire(import.meta.url);
const githubIdentity = require("./github_identity.js") as { isConfigured: () => boolean };

describe("github_identity", () => {
  let prevPat: string | undefined;
  let prevUser: string | undefined;

  beforeEach(() => {
    prevPat = process.env.PICLAW_GITHUB_PAT;
    prevUser = process.env.PICLAW_GITHUB_USERNAME;
    delete process.env.PICLAW_GITHUB_PAT;
    delete process.env.PICLAW_GITHUB_USERNAME;
  });

  afterEach(() => {
    if (prevPat === undefined) delete process.env.PICLAW_GITHUB_PAT;
    else process.env.PICLAW_GITHUB_PAT = prevPat;
    if (prevUser === undefined) delete process.env.PICLAW_GITHUB_USERNAME;
    else process.env.PICLAW_GITHUB_USERNAME = prevUser;
  });

  it("is configured when PAT is set (username optional)", () => {
    process.env.PICLAW_GITHUB_PAT = "ghp_test_token";
    expect(githubIdentity.isConfigured()).toBe(true);
  });

  it("is not configured when PAT is empty", () => {
    process.env.PICLAW_GITHUB_PAT = "";
    process.env.PICLAW_GITHUB_USERNAME = "someone";
    expect(githubIdentity.isConfigured()).toBe(false);
  });
});
