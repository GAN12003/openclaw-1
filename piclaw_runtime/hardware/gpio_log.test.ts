import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { SAFE_ROOT } = require("../core/self_guard.js") as { SAFE_ROOT: string };

describe("gpio_log", () => {
  let tmpDir: string;
  let logFile: string;

  beforeEach(async () => {
    vi.unstubAllEnvs();
    const base = path.join(SAFE_ROOT, "logs");
    await fs.promises.mkdir(base, { recursive: true });
    tmpDir = await fs.promises.mkdtemp(path.join(base, "gpio-test-"));
    logFile = path.join(tmpDir, "gpio-state.ndjson");
    const rel = path.relative(SAFE_ROOT, logFile);
    vi.stubEnv("PICLAW_GPIO_LOG_ENABLE", "1");
    vi.stubEnv("PICLAW_GPIO_LOG_PATH", rel);
    vi.stubEnv("PICLAW_GPIO_LOG_MAX_BYTES", "100000");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("appendGpioStateLog writes NDJSON line", async () => {
    vi.resetModules();
    const { appendGpioStateLog } = await import("./gpio_log.js");

    const record = { gpio: 17, value: "HIGH", edge: "rising", at: "2026-01-01T00:00:00.000Z" };
    appendGpioStateLog(record);

    const text = await fs.promises.readFile(logFile, "utf8");
    expect(JSON.parse(text.trim())).toEqual(record);
  });

  it("getLogSettings disables when PICLAW_GPIO_LOG_ENABLE=0", async () => {
    vi.stubEnv("PICLAW_GPIO_LOG_ENABLE", "0");
    vi.resetModules();
    const { getLogSettings, appendGpioStateLog } = await import("./gpio_log.js");

    expect(getLogSettings().enabled).toBe(false);
    appendGpioStateLog({ gpio: 1, value: "HIGH", edge: "rising", at: "x" });
    await expect(fs.promises.access(logFile)).rejects.toThrow();
  });

  it("truncates log when over PICLAW_GPIO_LOG_MAX_BYTES", async () => {
    vi.stubEnv("PICLAW_GPIO_LOG_MAX_BYTES", "80");
    vi.resetModules();
    const { appendGpioStateLog } = await import("./gpio_log.js");

    const big = { gpio: 17, pad: "x".repeat(100), at: "2026-01-01T00:00:00.000Z" };
    appendGpioStateLog(big);
    appendGpioStateLog({ gpio: 22, value: "LOW", edge: "falling", at: "2026-01-02T00:00:00.000Z" });

    const text = await fs.promises.readFile(logFile, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ gpio: 22 });
  });
});
