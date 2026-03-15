import assert from "node:assert/strict";
import test from "node:test";

import { RuntimeContextManager } from "../src/engine/runtime/runtime-context.js";
import type { EngineLogger } from "../src/engine/runtime/runtime-context.js";
import type { OpenClawPluginServiceContext } from "../src/types.js";

function createLogger(): EngineLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

function createServiceContext(
  overrides: Partial<OpenClawPluginServiceContext> = {},
): OpenClawPluginServiceContext {
  return {
    config: {},
    workspaceDir: "/tmp/test-workspace",
    stateDir: "/tmp/test-state",
    logger: createLogger(),
    ...overrides,
  };
}

test("RuntimeContextManager should store and retrieve runtime context", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });
  const ctx = createServiceContext();

  const saved = manager.rememberRuntimeContext(ctx);

  assert.equal(saved.workspaceDir, ctx.workspaceDir);
  assert.equal(saved.stateDir, ctx.stateDir);
  assert.deepEqual(saved.config, ctx.config);
});

test("RuntimeContextManager should return undefined before context is set", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });

  assert.equal(manager.getRuntimeContext(), undefined);
});

test("RuntimeContextManager should return context after rememberRuntimeContext", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });
  const ctx = createServiceContext({ workspaceDir: "/ws" });

  manager.rememberRuntimeContext(ctx);
  const retrieved = manager.getRuntimeContext();

  assert.ok(retrieved);
  assert.equal(retrieved.workspaceDir, "/ws");
});

test("RuntimeContextManager.requireRuntimeContext should throw when not initialized", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });

  assert.throws(
    () => manager.requireRuntimeContext(),
    /OpenClaw 宿主上下文缺失/,
  );
});

test("RuntimeContextManager.requireRuntimeContext should return context when initialized", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });
  const ctx = createServiceContext();

  manager.rememberRuntimeContext(ctx);
  const result = manager.requireRuntimeContext();

  assert.equal(result.workspaceDir, ctx.workspaceDir);
});

test("RuntimeContextManager should deep-copy config on remember", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });
  const originalConfig = { key: "value", nested: { a: 1 } };
  const ctx = createServiceContext({ config: originalConfig });

  const saved = manager.rememberRuntimeContext(ctx);

  // Mutating original config should not affect stored config
  originalConfig.key = "mutated";
  originalConfig.nested.a = 999;

  assert.equal(saved.config.key, "value");
  assert.equal((saved.config.nested as { a: number }).a, 1);
});

test("RuntimeContextManager.requireWorkspaceDir should throw when no workspace", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });

  assert.throws(
    () => manager.requireWorkspaceDir(),
    /OpenClaw workspaceDir 缺失/,
  );
});

test("RuntimeContextManager.requireWorkspaceDir should return workspace from stored context", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });
  const ctx = createServiceContext({ workspaceDir: "/my/workspace" });

  manager.rememberRuntimeContext(ctx);

  assert.equal(manager.requireWorkspaceDir(), "/my/workspace");
});

test("RuntimeContextManager.requireWorkspaceDir should prefer explicit context over stored", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });
  const stored = createServiceContext({ workspaceDir: "/stored" });
  const explicit = createServiceContext({ workspaceDir: "/explicit" });

  manager.rememberRuntimeContext(stored);

  assert.equal(manager.requireWorkspaceDir(explicit), "/explicit");
});

test("RuntimeContextManager.requireStateDir should throw when no state dir", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });

  assert.throws(() => manager.requireStateDir(), /OpenClaw stateDir 缺失/);
});

test("RuntimeContextManager.requireStateDir should return state dir from stored context", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });
  const ctx = createServiceContext({ stateDir: "/my/state" });

  manager.rememberRuntimeContext(ctx);

  assert.equal(manager.requireStateDir(), "/my/state");
});

test("RuntimeContextManager.getRuntimeContextFromCommand should merge command config", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });
  const runtimeCtx = createServiceContext({
    config: { base: true, override: "runtime" },
  });

  manager.rememberRuntimeContext(runtimeCtx);

  const result = manager.getRuntimeContextFromCommand({
    channel: "test-channel",
    commandBody: "test-command",
    config: { override: "command", extra: true },
    isAuthorizedSender: true,
  });

  assert.equal(result.config.base, true);
  assert.equal(result.config.override, "command");
  assert.equal(result.config.extra, true);
});

test("RuntimeContextManager.clearRuntimeContext should reset state", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });
  const ctx = createServiceContext();

  manager.rememberRuntimeContext(ctx);
  assert.ok(manager.getRuntimeContext());

  manager.clearRuntimeContext();
  assert.equal(manager.getRuntimeContext(), undefined);
});

test("RuntimeContextManager.clearRuntimeContext should allow re-initialization", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });

  manager.rememberRuntimeContext(
    createServiceContext({ workspaceDir: "/first" }),
  );
  manager.clearRuntimeContext();
  manager.rememberRuntimeContext(
    createServiceContext({ workspaceDir: "/second" }),
  );

  assert.equal(manager.requireWorkspaceDir(), "/second");
});

test("RuntimeContextManager.requireStateDir should prefer explicit context over stored", () => {
  const manager = new RuntimeContextManager({ logger: createLogger() });
  const stored = createServiceContext({ stateDir: "/stored-state" });
  const explicit = createServiceContext({ stateDir: "/explicit-state" });

  manager.rememberRuntimeContext(stored);

  assert.equal(manager.requireStateDir(explicit), "/explicit-state");
});

test("RuntimeContextManager.getRuntimeContextFromCommand should fall back to api.logger when stored logger is null", () => {
  const apiLogger = createLogger();
  const manager = new RuntimeContextManager({ logger: apiLogger });
  const ctx = createServiceContext({
    logger: null as unknown as typeof apiLogger,
  });

  manager.rememberRuntimeContext(ctx);

  const result = manager.getRuntimeContextFromCommand({
    channel: "ch",
    commandBody: "cmd",
    config: {},
    isAuthorizedSender: true,
  });

  assert.equal(result.logger, apiLogger);
});
