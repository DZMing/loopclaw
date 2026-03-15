import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  StatePersistenceManager,
  StateFileNames,
} from "../src/engine/runtime/state-persistence.js";
import type { EngineState } from "../src/engine/runtime/state-persistence.js";
import type { EngineLogger } from "../src/engine/runtime/runtime-context.js";
import type { OpenClawPluginServiceContext } from "../src/types.js";
import { withTempWorkspace } from "./helpers.js";

function createLogger(overrides: Partial<EngineLogger> = {}): EngineLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    ...overrides,
  };
}

function createStateContext(
  workspaceDir: string,
  stateDir: string,
): OpenClawPluginServiceContext {
  return {
    config: {},
    workspaceDir,
    stateDir,
    logger: createLogger(),
  };
}

test("StatePersistenceManager should start with zero loop count", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  assert.equal(manager.getLoopCount(), 0);
});

test("StatePersistenceManager should increment loop count", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  manager.incrementLoopCount();
  assert.equal(manager.getLoopCount(), 1);

  manager.incrementLoopCount();
  manager.incrementLoopCount();
  assert.equal(manager.getLoopCount(), 3);
});

test("StatePersistenceManager should set loop count directly", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  manager.setLoopCount(42);
  assert.equal(manager.getLoopCount(), 42);
});

test("StatePersistenceManager should maintain empty context initially", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  const context = manager.getContext();
  assert.deepEqual(context.actions, []);
  assert.deepEqual(context.errors, []);
});

test("StatePersistenceManager should add action records", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  manager.addAction({
    loop: 1,
    action: "test action",
    result: "success",
    timestamp: Date.now(),
  });

  const context = manager.getContext();
  assert.equal(context.actions.length, 1);
  assert.equal(context.actions[0].action, "test action");
  assert.equal(context.actions[0].result, "success");
});

test("StatePersistenceManager should add error records", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  manager.addError({
    loop: 5,
    category: "file_io",
    message: "ENOENT: file not found",
    timestamp: Date.now(),
  });

  const context = manager.getContext();
  assert.equal(context.errors.length, 1);
  assert.equal(context.errors[0].category, "file_io");
});

test("StatePersistenceManager should calculate context size", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  const emptySize = manager.getContextSize();

  manager.addAction({
    loop: 1,
    action: "some action",
    result: "some result",
    timestamp: Date.now(),
  });

  const withActionSize = manager.getContextSize();
  assert.ok(withActionSize > emptySize);
});

test("StatePersistenceManager should detect recent errors within 5 minutes", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  assert.equal(manager.hasRecentErrors(), false);

  manager.addError({
    loop: 1,
    category: "network",
    message: "connection refused",
    timestamp: Date.now(),
  });

  assert.equal(manager.hasRecentErrors(), true);
});

test("StatePersistenceManager should not detect old errors as recent", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  // Error from 10 minutes ago
  manager.addError({
    loop: 1,
    category: "network",
    message: "connection refused",
    timestamp: Date.now() - 10 * 60 * 1000,
  });

  assert.equal(manager.hasRecentErrors(), false);
});

test("StatePersistenceManager should return error stats by category", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  manager.addError({
    loop: 1,
    category: "file_io",
    message: "e1",
    timestamp: Date.now(),
  });
  manager.addError({
    loop: 2,
    category: "file_io",
    message: "e2",
    timestamp: Date.now(),
  });
  manager.addError({
    loop: 3,
    category: "network",
    message: "e3",
    timestamp: Date.now(),
  });

  const stats = manager.getErrorStats();
  assert.equal(stats.file_io, 2);
  assert.equal(stats.network, 1);
});

test("StatePersistenceManager should compress context to max limits", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  // Add 10 actions
  for (let i = 0; i < 10; i++) {
    manager.addAction({
      loop: i,
      action: `a${i}`,
      result: "ok",
      timestamp: Date.now(),
    });
  }
  // Add 8 errors
  for (let i = 0; i < 8; i++) {
    manager.addError({
      loop: i,
      category: "test",
      message: `e${i}`,
      timestamp: Date.now(),
    });
  }

  manager.compressContext(5, 3);

  const context = manager.getContext();
  assert.equal(context.actions.length, 5);
  assert.equal(context.errors.length, 3);

  // Should keep the most recent entries
  assert.equal(context.actions[0].action, "a5");
  assert.equal(context.actions[4].action, "a9");
});

test("StatePersistenceManager should not compress when under limits", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  manager.addAction({
    loop: 1,
    action: "a1",
    result: "ok",
    timestamp: Date.now(),
  });
  manager.addAction({
    loop: 2,
    action: "a2",
    result: "ok",
    timestamp: Date.now(),
  });

  manager.compressContext(10, 10);

  assert.equal(manager.getContext().actions.length, 2);
});

test("StatePersistenceManager.persistState should write state file atomically", async () => {
  await withTempWorkspace("lobster-state-persist", async ({ stateDir }) => {
    const manager = new StatePersistenceManager({ logger: createLogger() });
    const ctx = createStateContext("/ws", stateDir);

    manager.setLoopCount(5);
    manager.addAction({
      loop: 5,
      action: "test",
      result: "ok",
      timestamp: Date.now(),
    });

    await manager.persistState(ctx);

    const statePath = path.join(stateDir, StateFileNames.ENGINE_STATE);
    const data = JSON.parse(
      await fs.readFile(statePath, "utf-8"),
    ) as EngineState;

    assert.equal(data.loopCount, 5);
    assert.equal(data.context.actions.length, 1);
    assert.equal(data.version, "1.0.0");
  });
});

test("StatePersistenceManager.persistState should not leave temp files", async () => {
  await withTempWorkspace("lobster-state-no-temp", async ({ stateDir }) => {
    const manager = new StatePersistenceManager({ logger: createLogger() });
    const ctx = createStateContext("/ws", stateDir);

    await manager.persistState(ctx);

    const tmpPath = path.join(
      stateDir,
      StateFileNames.ENGINE_STATE + StateFileNames.TEMP_SUFFIX,
    );
    await assert.rejects(
      () => fs.access(tmpPath),
      /ENOENT/,
      "Temp file should be cleaned up after successful persist",
    );
  });
});

test("StatePersistenceManager.recoverState should restore from disk", async () => {
  await withTempWorkspace("lobster-state-recover", async ({ stateDir }) => {
    const ctx = createStateContext("/ws", stateDir);
    const statePath = path.join(stateDir, StateFileNames.ENGINE_STATE);

    // Write a state file manually
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      statePath,
      JSON.stringify({
        isRunning: false,
        loopCount: 42,
        context: {
          actions: [
            { loop: 42, action: "persisted", result: "ok", timestamp: 1000 },
          ],
          errors: [
            {
              loop: 40,
              category: "test",
              message: "old error",
              timestamp: 500,
            },
          ],
        },
        lastUpdate: new Date().toISOString(),
        version: "1.0.0",
      }),
      "utf-8",
    );

    const manager = new StatePersistenceManager({ logger: createLogger() });
    await manager.recoverState(ctx);

    assert.equal(manager.getLoopCount(), 42);
    const context = manager.getContext();
    assert.equal(context.actions.length, 1);
    assert.equal(context.actions[0].action, "persisted");
    assert.equal(context.errors.length, 1);
  });
});

test("StatePersistenceManager.recoverState should handle missing state file gracefully", async () => {
  await withTempWorkspace("lobster-state-no-file", async ({ stateDir }) => {
    const ctx = createStateContext("/ws", stateDir);
    const manager = new StatePersistenceManager({ logger: createLogger() });

    // Should not throw
    await manager.recoverState(ctx);

    assert.equal(manager.getLoopCount(), 0);
  });
});

test("StatePersistenceManager.recoverState should handle corrupted state file", async () => {
  await withTempWorkspace("lobster-state-corrupt", async ({ stateDir }) => {
    const ctx = createStateContext("/ws", stateDir);
    const statePath = path.join(stateDir, StateFileNames.ENGINE_STATE);

    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(statePath, "NOT VALID JSON {{{", "utf-8");

    const warnings: string[] = [];
    const manager = new StatePersistenceManager({
      logger: createLogger({
        warn: (msg: string) => warnings.push(msg),
      }),
    });

    // Should not throw, should log warning
    await manager.recoverState(ctx);

    assert.equal(manager.getLoopCount(), 0);
    assert.ok(warnings.length > 0);
    assert.ok(warnings[0].includes("状态恢复失败"));
  });
});

test("StatePersistenceManager.recoverState should reject invalid loopCount", async () => {
  await withTempWorkspace("lobster-state-invalid", async ({ stateDir }) => {
    const ctx = createStateContext("/ws", stateDir);
    const statePath = path.join(stateDir, StateFileNames.ENGINE_STATE);

    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      statePath,
      JSON.stringify({
        loopCount: -5, // invalid
        context: { actions: [], errors: [] },
        version: "1.0.0",
      }),
      "utf-8",
    );

    const manager = new StatePersistenceManager({ logger: createLogger() });
    await manager.recoverState(ctx);

    // Should not restore negative loop count
    assert.equal(manager.getLoopCount(), 0);
  });
});

test("StatePersistenceManager should roundtrip persist and recover", async () => {
  await withTempWorkspace("lobster-state-roundtrip", async ({ stateDir }) => {
    const ctx = createStateContext("/ws", stateDir);

    // Create and persist
    const manager1 = new StatePersistenceManager({ logger: createLogger() });
    manager1.setLoopCount(100);
    manager1.addAction({
      loop: 100,
      action: "roundtrip test",
      result: "success",
      timestamp: Date.now(),
    });
    manager1.addError({
      loop: 99,
      category: "timeout",
      message: "request timeout",
      timestamp: Date.now(),
    });
    await manager1.persistState(ctx);

    // Recover into new instance
    const manager2 = new StatePersistenceManager({ logger: createLogger() });
    await manager2.recoverState(ctx);

    assert.equal(manager2.getLoopCount(), 100);
    assert.equal(manager2.getContext().actions.length, 1);
    assert.equal(manager2.getContext().actions[0].action, "roundtrip test");
    assert.equal(manager2.getContext().errors.length, 1);
    assert.equal(manager2.getContext().errors[0].category, "timeout");
  });
});

test("StatePersistenceManager.setContext should replace context", () => {
  const manager = new StatePersistenceManager({ logger: createLogger() });

  manager.addAction({
    loop: 1,
    action: "original",
    result: "ok",
    timestamp: Date.now(),
  });
  assert.equal(manager.getContext().actions.length, 1);

  manager.setContext({ actions: [], errors: [] });
  assert.equal(manager.getContext().actions.length, 0);
});

test("StatePersistenceManager.persistState should warn on write failure", async () => {
  await withTempWorkspace("lobster-state-write-fail", async ({ stateDir }) => {
    const warned: string[] = [];
    const manager = new StatePersistenceManager({
      logger: createLogger({ warn: (m: string) => warned.push(m) }),
    });

    // Make stateDir read-only so writes fail
    await fs.chmod(stateDir, 0o555);
    try {
      const ctx = createStateContext("/ws", stateDir);
      await manager.persistState(ctx);
      assert.ok(warned.length > 0, "Should have warned about write failure");
      assert.ok(warned[0].includes("状态持久化失败"));
    } finally {
      // Restore permissions for cleanup
      await fs.chmod(stateDir, 0o755);
    }
  });
});

test("StatePersistenceManager.recoverState should default errors to empty array when field is missing", async () => {
  await withTempWorkspace("lobster-state-no-errors", async ({ stateDir }) => {
    const ctx = createStateContext("/ws", stateDir);
    const statePath = path.join(stateDir, StateFileNames.ENGINE_STATE);

    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      statePath,
      JSON.stringify({
        loopCount: 3,
        context: {
          actions: [{ loop: 3, action: "act", result: "ok", timestamp: 1 }],
          // no "errors" key — triggers `|| []` fallback on line 184
        },
        version: "1.0.0",
      }),
      "utf-8",
    );

    const manager = new StatePersistenceManager({ logger: createLogger() });
    await manager.recoverState(ctx);

    assert.equal(manager.getLoopCount(), 3);
    assert.deepEqual(manager.getContext().errors, []);
  });
});

test("StatePersistenceManager.recoverState should use String(error) when error is non-Error", async () => {
  await withTempWorkspace(
    "lobster-state-recover-non-error",
    async ({ stateDir }) => {
      const ctx = createStateContext("/ws", stateDir);
      const statePath = path.join(stateDir, StateFileNames.ENGINE_STATE);
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(
        statePath,
        '{"loopCount":1,"context":{"actions":[],"errors":[]},"version":"1.0.0"}',
        "utf-8",
      );
      const warnings: string[] = [];
      const manager = new StatePersistenceManager({
        logger: createLogger({ warn: (msg: string) => warnings.push(msg) }),
      });
      const origParse = JSON.parse;
      JSON.parse = () => {
        throw "non-error-string";
      };
      try {
        await manager.recoverState(ctx);
      } finally {
        JSON.parse = origParse;
      }
      assert.equal(manager.getLoopCount(), 0);
      assert.ok(warnings.length > 0);
      assert.ok(warnings[0].includes("状态恢复失败"));
      assert.ok(warnings[0].includes("non-error-string"));
    },
  );
});

test("StatePersistenceManager.persistState should use String(error) when error is non-Error", async () => {
  await withTempWorkspace(
    "lobster-state-persist-non-error",
    async ({ stateDir }) => {
      const warnings: string[] = [];
      const manager = new StatePersistenceManager({
        logger: createLogger({ warn: (msg: string) => warnings.push(msg) }),
      });
      const ctx = createStateContext("/ws", stateDir);
      const origStringify = JSON.stringify;
      JSON.stringify = () => {
        throw "non-error-stringify";
      };
      try {
        await manager.persistState(ctx);
      } finally {
        JSON.stringify = origStringify;
      }
      assert.ok(warnings.length > 0);
      assert.ok(warnings[0].includes("状态持久化失败"));
      assert.ok(warnings[0].includes("non-error-stringify"));
    },
  );
});

test("StateFileNames should export expected constants", () => {
  assert.equal(StateFileNames.ENGINE_STATE, "engine-state.json");
  assert.equal(StateFileNames.STATE_DIR, ".lobster-engine");
  assert.equal(StateFileNames.SUGGESTIONS_LOG, "suggestions.log");
  assert.equal(StateFileNames.TEMP_SUFFIX, ".tmp");
  assert.equal(StateFileNames.LATEST_REPORT, "latest-report.json");
  assert.equal(StateFileNames.REPORT_HISTORY, "report-history.jsonl");
});
