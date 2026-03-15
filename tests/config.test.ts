import assert from "node:assert/strict";
import test from "node:test";

import {
  ConfigValidationError,
  DEFAULT_CONFIG,
  loadConfig,
  validateConfig,
} from "../src/config.js";
import { withEnv } from "./helpers.js";

test("loadConfig should never return NaN values when env vars are missing or invalid", async () => {
  await withEnv(
    {
      LOBSTER_PERSIST_INTERVAL: undefined,
      LOBSTER_REPORT_INTERVAL: "abc",
      LOBSTER_CACHE_TTL: "",
      LOBSTER_STALL_THRESHOLD: undefined,
      LOBSTER_HEALTH_CHECK_INTERVAL: undefined,
      LOBSTER_MAX_ACTIONS: "bad",
      LOBSTER_MAX_ERRORS: "",
    },
    async () => {
      const config = loadConfig({ compressInterval: 5 });

      assert.equal(config.compressInterval, 5);
      assert.equal(config.persistInterval, DEFAULT_CONFIG.persistInterval);
      assert.equal(config.reportInterval, DEFAULT_CONFIG.reportInterval);
      assert.equal(config.cacheTTL, DEFAULT_CONFIG.cacheTTL);
      assert.equal(config.stallThreshold, DEFAULT_CONFIG.stallThreshold);
      assert.equal(
        config.healthCheckInterval,
        DEFAULT_CONFIG.healthCheckInterval,
      );
      assert.equal(config.maxActions, DEFAULT_CONFIG.maxActions);
      assert.equal(config.maxErrors, DEFAULT_CONFIG.maxErrors);
    },
  );
});

test("validateConfig should reject NaN and infinite numeric values", () => {
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, persistInterval: Number.NaN }),
    ConfigValidationError,
  );

  assert.throws(
    () =>
      validateConfig({ ...DEFAULT_CONFIG, cacheTTL: Number.POSITIVE_INFINITY }),
    ConfigValidationError,
  );
});

test("loadConfig should fail fast when explicit OpenClaw config is invalid", () => {
  assert.throws(() => loadConfig({ reportInterval: 0 }), ConfigValidationError);

  assert.throws(
    () => loadConfig({ compressInterval: "abc" }),
    ConfigValidationError,
  );
});

test("loadConfig should reject invalid enum values for reportTarget and llmProvider", () => {
  assert.throws(
    () => loadConfig({ reportTarget: "invalid_target" }),
    ConfigValidationError,
  );
  assert.throws(
    () => loadConfig({ llmProvider: "unknown_provider" }),
    ConfigValidationError,
  );
});

test("loadConfig should read reportTarget from env var when valid", async () => {
  await withEnv({ LOBSTER_REPORT_TARGET: "discord" }, async () => {
    const config = loadConfig({});
    assert.equal(config.reportTarget, "discord");
  });
});

test("validateConfig should reject out-of-range compressInterval and persistInterval", () => {
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, compressInterval: 0 }),
    ConfigValidationError,
  );
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, compressInterval: 101 }),
    ConfigValidationError,
  );
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, persistInterval: 0 }),
    ConfigValidationError,
  );
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, persistInterval: 1001 }),
    ConfigValidationError,
  );
});

test("validateConfig should reject out-of-range stallThreshold and healthCheckInterval", () => {
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, stallThreshold: 999 }),
    ConfigValidationError,
  );
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, stallThreshold: 300001 }),
    ConfigValidationError,
  );
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, healthCheckInterval: 500 }),
    ConfigValidationError,
  );
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, healthCheckInterval: 999999 }),
    ConfigValidationError,
  );
});

test("validateConfig should reject out-of-range maxActions and maxErrors", () => {
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, maxActions: 0 }),
    ConfigValidationError,
  );
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, maxActions: 1001 }),
    ConfigValidationError,
  );
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, maxErrors: 0 }),
    ConfigValidationError,
  );
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, maxErrors: 501 }),
    ConfigValidationError,
  );
});

test("loadConfig should work when called without arguments (uses default config)", () => {
  const config = loadConfig();
  assert.equal(config.persistInterval, DEFAULT_CONFIG.persistInterval);
});

test("loadConfig should read boolean false from env var", async () => {
  await withEnv({ LOBSTER_CACHE: "false" }, async () => {
    const config = loadConfig({});
    assert.equal(config.enableCache, false);
  });
});

test("loadConfig should throw when optional string field is set to empty string", () => {
  assert.throws(() => loadConfig({ reportChannel: "" }), ConfigValidationError);
});

test("loadConfig should throw when boolean field is set to non-boolean value", () => {
  assert.throws(
    () => loadConfig({ enableCache: "notabool" }),
    ConfigValidationError,
  );
});

test("loadConfig should read boolean from env var when not in config", async () => {
  await withEnv({ LOBSTER_CACHE: "true" }, async () => {
    const config = loadConfig({});
    assert.equal(config.enableCache, true);
  });
});

test("loadConfig should read number from env var when not in config", async () => {
  await withEnv({ LOBSTER_PERSIST_INTERVAL: "7" }, async () => {
    const config = loadConfig({});
    assert.equal(config.persistInterval, 7);
  });
});

test("loadConfig should throw when string field is set to non-string non-null value", () => {
  assert.throws(
    () => loadConfig({ reportChannel: 123 }),
    ConfigValidationError,
  );
});

test("loadConfig should load report and llm settings from OpenClaw config", () => {
  const config = loadConfig({
    reportTarget: "discord",
    reportChannel: "https://discord.example/webhook",
    llmProvider: "openclaw",
    llmModel: "gpt-5.1",
    llmBaseURL: "https://llm.internal/v1",
  });

  assert.equal(config.reportTarget, "discord");
  assert.equal(config.reportChannel, "https://discord.example/webhook");
  assert.equal(config.llmProvider, "openclaw");
  assert.equal(config.llmModel, "gpt-5.1");
  assert.equal(config.llmBaseURL, "https://llm.internal/v1");
});
