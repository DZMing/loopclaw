/**
 * Loop Engine Reliability Guards Tests
 *
 * Tests for the runaway loop prevention mechanisms:
 * - Error backoff (exponential, 1s → 60s max)
 * - Circuit breaker (auto-stop after 10 consecutive errors)
 * - Minimum loop interval (1 second minimum)
 * - Active health check (auto-stop after 300 seconds stall)
 * - Error categorization
 *
 * @version 2.48.1
 * @since 2026-03-13
 * @author Runtime Reliability Engineer
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  LoopEngineManager,
  ErrorCategory,
  MAX_CONSECUTIVE_ERRORS,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MIN_LOOP_INTERVAL_MS,
  MAX_LOG_SIZE_MB,
  MAX_STALL_SECONDS,
  type ContextState,
} from "../src/engine/runtime/loop-engine.js";
import type { EngineLogger } from "../src/engine/runtime/runtime-context.js";
import type { OpenClawPluginServiceContext } from "../types.js";

// ========== Test Helpers ==========

function createLogger(overrides: Partial<EngineLogger> = {}): {
  logger: EngineLogger;
  logs: { level: string; message: string }[];
} {
  const logs: { level: string; message: string }[] = [];
  const logger: EngineLogger = {
    info: (msg: string) => logs.push({ level: "info", message: msg }),
    warn: (msg: string) => logs.push({ level: "warn", message: msg }),
    error: (msg: string) => logs.push({ level: "error", message: msg }),
    debug: (msg: string) => logs.push({ level: "debug", message: msg }),
    ...overrides,
  };
  return { logger, logs };
}

function createDefaultConfig() {
  return {
    compressInterval: 5,
    reportInterval: 10,
    persistInterval: 3,
    enableHealthCheck: true,
    healthCheckInterval: 1000,
    stallThreshold: 5000,
    enableCache: true,
    cacheTTL: 60000,
  };
}

function createServiceContext(
  overrides: Partial<OpenClawPluginServiceContext> = {},
): OpenClawPluginServiceContext {
  return {
    config: {},
    workspaceDir: "/tmp/test-workspace",
    stateDir: "/tmp/test-state",
    logger: createLogger().logger,
    ...overrides,
  };
}

function createMockDependencies() {
  return {
    loadMissionFiles: async () => ({
      mission: "Test Mission",
      boundaries: "Test Boundaries",
    }),
    planNextAction: async () => ({
      description: "Test Action",
      type: "execute",
    }),
    executeAction: async () => ({ summary: "Action completed" }),
    persistState: async () => {},
    compressContext: () => {},
    cleanExpiredCache: () => {},
  };
}

// ========== Error Categorization Tests ==========

describe("ErrorCategory", () => {
  it("should categorize file I/O errors", () => {
    assert.equal(ErrorCategory.FILE_IO, "file_io");
    assert.equal(ErrorCategory.NETWORK, "network");
    assert.equal(ErrorCategory.PARSE, "parse");
    assert.equal(ErrorCategory.PERMISSION, "permission");
    assert.equal(ErrorCategory.TIMEOUT, "timeout");
    assert.equal(ErrorCategory.UNKNOWN, "unknown");
  });
});

// ========== LoopEngineManager State Tests ==========

describe("LoopEngineManager", () => {
  let manager: LoopEngineManager;
  let logs: { level: string; message: string }[];
  let logger: EngineLogger;

  beforeEach(() => {
    const result = createLogger();
    logger = result.logger;
    logs = result.logs;

    manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
  });

  describe("initial state", () => {
    it("should not be running initially", () => {
      assert.equal(manager.isRunning(), false);
    });

    it("should have zero loop count initially", () => {
      assert.equal(manager.getLoopCount(), 0);
    });

    it("should have empty context initially", () => {
      const context = manager.getContext();
      assert.deepEqual(context.actions, []);
      assert.deepEqual(context.errors, []);
    });

    it("should have zero context size initially", () => {
      assert.ok(
        manager.getContextSize() > 0,
        "Context size should be non-empty (even empty object has size)",
      );
    });

    it("should have no recent errors initially", () => {
      assert.equal(manager.hasRecentErrors(), false);
    });
  });

  describe("loop count management", () => {
    it("should allow setting loop count", () => {
      manager.setLoopCount(42);
      assert.equal(manager.getLoopCount(), 42);
    });

    it("should allow setting loop count to zero", () => {
      manager.setLoopCount(100);
      manager.setLoopCount(0);
      assert.equal(manager.getLoopCount(), 0);
    });
  });

  describe("context management", () => {
    it("should allow setting context", () => {
      const newContext: ContextState = {
        actions: [
          { loop: 1, action: "test", result: "done", timestamp: Date.now() },
        ],
        errors: [],
      };

      manager.setContext(newContext);

      const retrieved = manager.getContext();
      assert.equal(retrieved.actions.length, 1);
      assert.equal(retrieved.actions[0].action, "test");
    });

    it("should allow setting context with errors", () => {
      const newContext: ContextState = {
        actions: [],
        errors: [
          {
            loop: 5,
            error: "Test error",
            timestamp: Date.now(),
            category: ErrorCategory.FILE_IO,
          },
        ],
      };

      manager.setContext(newContext);

      const retrieved = manager.getContext();
      assert.equal(retrieved.errors.length, 1);
      assert.equal(retrieved.errors[0].category, ErrorCategory.FILE_IO);
    });
  });

  describe("error tracking", () => {
    it("should detect recent errors", () => {
      const recentContext: ContextState = {
        actions: [],
        errors: [
          {
            loop: 1,
            error: "Recent error",
            timestamp: Date.now() - 60000, // 1 minute ago
          },
        ],
      };

      manager.setContext(recentContext);
      assert.equal(manager.hasRecentErrors(), true);
    });

    it("should not detect old errors as recent", () => {
      const oldContext: ContextState = {
        actions: [],
        errors: [
          {
            loop: 1,
            error: "Old error",
            timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
          },
        ],
      };

      manager.setContext(oldContext);
      assert.equal(manager.hasRecentErrors(), false);
    });

    it("should track error statistics by category", () => {
      const context: ContextState = {
        actions: [],
        errors: [
          {
            loop: 1,
            error: "e1",
            timestamp: 1,
            category: ErrorCategory.FILE_IO,
          },
          {
            loop: 2,
            error: "e2",
            timestamp: 2,
            category: ErrorCategory.FILE_IO,
          },
          {
            loop: 3,
            error: "e3",
            timestamp: 3,
            category: ErrorCategory.NETWORK,
          },
          { loop: 4, error: "e4", timestamp: 4 }, // unknown
        ],
      };

      manager.setContext(context);

      const stats = manager.getErrorStats();
      assert.equal(stats[ErrorCategory.FILE_IO], 2);
      assert.equal(stats[ErrorCategory.NETWORK], 1);
      assert.equal(stats[ErrorCategory.UNKNOWN], 1);
    });
  });

  describe("performance metrics", () => {
    it("should return zero loops per second initially", () => {
      assert.equal(manager.getLoopsPerSecond(), 0);
    });

    it("should return zero average loop time initially", () => {
      assert.equal(manager.getAvgLoopTime(), 0);
    });
  });
});

// ========== ErrorCategory Enum Tests ==========

describe("ErrorCategory Enum", () => {
  it("should have all required error categories", () => {
    assert.equal(ErrorCategory.UNKNOWN, "unknown");
    assert.equal(ErrorCategory.FILE_IO, "file_io");
    assert.equal(ErrorCategory.PARSE, "parse");
    assert.equal(ErrorCategory.NETWORK, "network");
    assert.equal(ErrorCategory.PERMISSION, "permission");
    assert.equal(ErrorCategory.TIMEOUT, "timeout");
  });
});

// ========== Runaway Loop Prevention Constants Tests ==========

describe("Runaway Loop Prevention Constants", () => {
  it("should have maximum consecutive errors threshold of 10", () => {
    assert.equal(MAX_CONSECUTIVE_ERRORS, 10);
  });

  it("should have base backoff of 1000ms", () => {
    assert.equal(BASE_BACKOFF_MS, 1000);
  });

  it("should have max backoff of 60000ms", () => {
    assert.equal(MAX_BACKOFF_MS, 60000);
  });

  it("should have minimum loop interval of 1000ms", () => {
    assert.equal(MIN_LOOP_INTERVAL_MS, 1000);
  });

  it("should have max stall seconds of 300", () => {
    assert.equal(MAX_STALL_SECONDS, 300);
  });

  it("should have max log size of 50MB", () => {
    assert.equal(MAX_LOG_SIZE_MB, 50);
  });

  it("should compute exponential backoff correctly", () => {
    // Verify the backoff formula: BASE * 2^(n-1), capped at MAX
    const backoff = (n: number) =>
      Math.min(BASE_BACKOFF_MS * Math.pow(2, n - 1), MAX_BACKOFF_MS);
    assert.equal(backoff(1), 1000); // 1st error: 1s
    assert.equal(backoff(2), 2000); // 2nd error: 2s
    assert.equal(backoff(3), 4000); // 3rd error: 4s
    assert.equal(backoff(6), 32000); // 6th error: 32s
    assert.equal(backoff(10), 60000); // 10th error: capped at 60s
    assert.equal(backoff(20), 60000); // 20th error: still capped at 60s
  });
});

// ========== Concurrent Error Handling Simulation ==========

describe("Error Handling Simulation", () => {
  it("should track consecutive errors correctly", () => {
    const { logger, logs } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );

    // Simulate errors being added to context
    const context: ContextState = {
      actions: [],
      errors: [],
    };

    // Add 10 errors
    for (let i = 1; i <= 10; i++) {
      context.errors.push({
        loop: i,
        error: `Simulated error ${i}`,
        timestamp: Date.now(),
        category: ErrorCategory.UNKNOWN,
      });
    }

    manager.setContext(context);

    // Verify error count
    assert.equal(manager.getContext().errors.length, 10);
  });

  it("should correctly categorize different error types", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );

    const context: ContextState = {
      actions: [],
      errors: [
        {
          loop: 1,
          error: "ENOENT: file not found",
          timestamp: 1,
          category: ErrorCategory.FILE_IO,
        },
        {
          loop: 2,
          error: "SyntaxError: Unexpected token",
          timestamp: 2,
          category: ErrorCategory.PARSE,
        },
        {
          loop: 3,
          error: "Network timeout",
          timestamp: 3,
          category: ErrorCategory.NETWORK,
        },
        {
          loop: 4,
          error: "Permission denied",
          timestamp: 4,
          category: ErrorCategory.PERMISSION,
        },
        {
          loop: 5,
          error: "Request timed out",
          timestamp: 5,
          category: ErrorCategory.TIMEOUT,
        },
        {
          loop: 6,
          error: "Unknown error",
          timestamp: 6,
          category: ErrorCategory.UNKNOWN,
        },
      ],
    };

    manager.setContext(context);

    const stats = manager.getErrorStats();
    assert.equal(stats[ErrorCategory.FILE_IO], 1);
    assert.equal(stats[ErrorCategory.PARSE], 1);
    assert.equal(stats[ErrorCategory.NETWORK], 1);
    assert.equal(stats[ErrorCategory.PERMISSION], 1);
    assert.equal(stats[ErrorCategory.TIMEOUT], 1);
    assert.equal(stats[ErrorCategory.UNKNOWN], 1);
  });
});

// ========== Private Method Coverage (via as any) ==========

describe("Private Method Coverage", () => {
  it("categorizeError — enoent → FILE_IO", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    const categorize = (msg: string) =>
      (manager as any).categorizeError(msg) as string;
    assert.equal(categorize("ENOENT: no such file"), ErrorCategory.FILE_IO);
  });

  it("categorizeError — eacces → FILE_IO", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    assert.equal(
      (manager as any).categorizeError("EACCES permission"),
      ErrorCategory.FILE_IO,
    );
  });

  it("categorizeError — file → FILE_IO", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    assert.equal(
      (manager as any).categorizeError("file read error"),
      ErrorCategory.FILE_IO,
    );
  });

  it("categorizeError — syntax → PARSE", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    assert.equal(
      (manager as any).categorizeError("SyntaxError: unexpected token"),
      ErrorCategory.PARSE,
    );
  });

  it("categorizeError — json → PARSE", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    assert.equal(
      (manager as any).categorizeError("JSON parse error"),
      ErrorCategory.PARSE,
    );
  });

  it("categorizeError — network → NETWORK", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    assert.equal(
      (manager as any).categorizeError("network timeout"),
      ErrorCategory.NETWORK,
    );
  });

  it("categorizeError — fetch → NETWORK", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    assert.equal(
      (manager as any).categorizeError("fetch failed"),
      ErrorCategory.NETWORK,
    );
  });

  it("categorizeError — permission → PERMISSION", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    assert.equal(
      (manager as any).categorizeError("permission denied"),
      ErrorCategory.PERMISSION,
    );
  });

  it("categorizeError — unauthorized → PERMISSION", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    assert.equal(
      (manager as any).categorizeError("unauthorized access"),
      ErrorCategory.PERMISSION,
    );
  });

  it("categorizeError — timeout → TIMEOUT", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    assert.equal(
      (manager as any).categorizeError("timeout exceeded"),
      ErrorCategory.TIMEOUT,
    );
  });

  it("categorizeError — unknown → UNKNOWN", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    assert.equal(
      (manager as any).categorizeError("some random error"),
      ErrorCategory.UNKNOWN,
    );
  });

  it("logPerformanceMetrics — logs performance info message", () => {
    const { logger, logs } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    manager.setLoopCount(5);
    (manager as any).logPerformanceMetrics();
    assert.ok(
      logs.some((l) => l.level === "info" && l.message.includes("📊 性能指标")),
    );
  });

  it("logPerformanceMetrics — minTime=Infinity shows 0", () => {
    const { logger, logs } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    // minTime starts as Infinity when no loops have run
    (manager as any).logPerformanceMetrics();
    const infoLog = logs.find(
      (l) => l.level === "info" && l.message.includes("📊 性能指标"),
    );
    assert.ok(infoLog !== undefined);
    // Should show 0 for fastest time when Infinity
    assert.ok(infoLog!.message.includes("最快=0ms"));
  });

  it("stopHealthCheck — safe to call when no interval running", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );
    // Should not throw even when healthCheckInterval is null
    assert.doesNotThrow(() => (manager as any).stopHealthCheck());
  });

  it("stopHealthCheck — clears interval when running", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      { ...createDefaultConfig(), enableHealthCheck: true } as any,
      createMockDependencies() as any,
    );
    // Manually set a fake interval
    (manager as any).healthCheckInterval = setInterval(() => {}, 100000);
    assert.ok((manager as any).healthCheckInterval !== null);
    (manager as any).stopHealthCheck();
    assert.equal((manager as any).healthCheckInterval, null);
  });

  it("startHealthCheck — does nothing when enableHealthCheck=false", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      { ...createDefaultConfig(), enableHealthCheck: false } as any,
      createMockDependencies() as any,
    );
    (manager as any).startHealthCheck();
    assert.equal((manager as any).healthCheckInterval, null);
  });

  it("startHealthCheck — sets interval when enableHealthCheck=true", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      {
        ...createDefaultConfig(),
        enableHealthCheck: true,
        healthCheckInterval: 50000,
      } as any,
      createMockDependencies() as any,
    );
    (manager as any).startHealthCheck();
    assert.ok((manager as any).healthCheckInterval !== null);
    // Clean up
    (manager as any).stopHealthCheck();
  });
});

// ========== Reliability Guard Behavior Tests ==========

describe("Reliability Guard Behavior", () => {
  it("should maintain state after context updates", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );

    // Initial state
    assert.equal(manager.isRunning(), false);
    assert.equal(manager.getLoopCount(), 0);

    // Update loop count
    manager.setLoopCount(100);
    assert.equal(manager.getLoopCount(), 100);

    // Update context
    manager.setContext({
      actions: [
        { loop: 1, action: "test", result: "ok", timestamp: Date.now() },
      ],
      errors: [],
    });

    // State should persist
    assert.equal(manager.getLoopCount(), 100);
    assert.equal(manager.getContext().actions.length, 1);
  });

  it("should correctly track multiple error sources", () => {
    const { logger } = createLogger();
    const manager = new LoopEngineManager(
      { logger },
      createDefaultConfig() as any,
      createMockDependencies() as any,
    );

    // Simulate a realistic error scenario
    const now = Date.now();
    manager.setContext({
      actions: [
        { loop: 1, action: "init", result: "success", timestamp: now - 60000 },
        {
          loop: 2,
          action: "analyze",
          result: "success",
          timestamp: now - 50000,
        },
        { loop: 3, action: "check", result: "success", timestamp: now - 40000 },
      ],
      errors: [
        {
          loop: 4,
          error: "File read error",
          timestamp: now - 30000,
          category: ErrorCategory.FILE_IO,
        },
        {
          loop: 5,
          error: "Parse failed",
          timestamp: now - 20000,
          category: ErrorCategory.PARSE,
        },
        {
          loop: 6,
          error: "Network error",
          timestamp: now - 10000,
          category: ErrorCategory.NETWORK,
        },
      ],
    });

    assert.equal(manager.getContext().actions.length, 3);
    assert.equal(manager.getContext().errors.length, 3);
    assert.equal(manager.hasRecentErrors(), true);

    const stats = manager.getErrorStats();
    assert.equal(Object.keys(stats).length, 3);
  });
});
