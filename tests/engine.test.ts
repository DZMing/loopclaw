import assert from "node:assert/strict";
import test from "node:test";

import { PerpetualEngineService, withTimeout } from "../src/engine/service.js";
import { createLogger } from "./helpers.js";

test("PerpetualEngineService should expose stable initial state", async () => {
  const engine = new PerpetualEngineService({ logger: createLogger() });

  assert.equal(engine.isRunning(), false);
  assert.equal(engine.getLoopCount(), 0);
  assert.deepEqual(engine.getErrorStats(), {});
  assert.equal(engine.getAvgLoopTime(), 0);
  assert.equal(engine.getLoopsPerSecond(), 0);
});

test("withTimeout should reject only after the configured timeout elapses", async () => {
  const startedAt = Date.now();

  await assert.rejects(
    withTimeout(
      new Promise<void>((resolve) => setTimeout(resolve, 50)),
      10,
      "slow operation",
    ),
    /slow operation 超时 \(10ms\)/,
  );

  assert.ok(Date.now() - startedAt >= 10);
});
