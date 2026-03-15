import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ZeroLatencyLoopEngine,
  MicrotaskBatcher,
  NonBlockingExecutor,
  createZeroLatencyLoop,
  createMicrotaskBatcher,
} from "../src/engine/zero-latency-loop.js";

describe("ZeroLatencyLoopEngine", () => {
  describe("基础启动/停止", () => {
    it("初始状态不在运行中", () => {
      const engine = new ZeroLatencyLoopEngine();
      assert.equal(engine.running(), false);
    });

    it("start 后状态为运行中（通过 loopBody 返回 false 停止）", async () => {
      const engine = new ZeroLatencyLoopEngine({ yieldAfterEachLoop: false });
      let ran = false;
      await engine.start(() => {
        ran = true;
        return false; // 第一次就停止
      });
      assert.equal(ran, true);
      assert.equal(engine.running(), false);
    });

    it("loopBody 返回 false 后停止循环", async () => {
      const engine = new ZeroLatencyLoopEngine({ yieldAfterEachLoop: false });
      let count = 0;
      await engine.start(() => {
        count++;
        return count < 3;
      });
      assert.equal(count, 3);
    });

    it("stop() 中途停止循环", async () => {
      const engine = new ZeroLatencyLoopEngine({ yieldAfterEachLoop: false });
      let count = 0;
      await engine.start(() => {
        count++;
        if (count >= 2) engine.stop();
        return true;
      });
      assert.ok(count >= 2);
      assert.equal(engine.running(), false);
    });
  });

  describe("loopCount", () => {
    it("每次循环后计数递增（返回 false 的最后一轮不计入）", async () => {
      const engine = new ZeroLatencyLoopEngine({ yieldAfterEachLoop: false });
      let n = 0;
      await engine.start(() => {
        n++;
        return n < 5; // 第 5 次返回 false 时 break，不递增
      });
      // n=1~4 返回 true：loopCount=4；n=5 返回 false break
      assert.equal(engine.getLoopCount(), 4);
    });

    it("异常不影响 loopCount 递增", async () => {
      const engine = new ZeroLatencyLoopEngine({ yieldAfterEachLoop: false });
      let n = 0;
      await engine.start(() => {
        n++;
        if (n === 1) throw new Error("oops");
        return n < 3; // n=3 返回 false break，不递增
      });
      // n=1: 异常 loopCount++（1）；n=2: 返回 true loopCount++（2）；n=3: 返回 false break
      assert.equal(engine.getLoopCount(), 2);
    });
  });

  describe("yieldAfterEachLoop", () => {
    it("yieldAfterEachLoop=true 时可以正常运行", async () => {
      const engine = new ZeroLatencyLoopEngine({ yieldAfterEachLoop: true });
      let n = 0;
      await engine.start(() => {
        n++;
        return n < 2;
      });
      assert.equal(n, 2);
    });
  });

  describe("metrics", () => {
    it("初始 metrics 全部为 0", () => {
      const engine = new ZeroLatencyLoopEngine();
      const m = engine.getMetrics();
      assert.equal(m.sampleCount, 0);
      assert.equal(m.avgLag, 0);
      assert.equal(m.maxLag, 0);
      assert.equal(m.highLagCount, 0);
    });

    it("运行后 sampleCount 递增", async () => {
      const engine = new ZeroLatencyLoopEngine({ yieldAfterEachLoop: false });
      let n = 0;
      await engine.start(() => {
        n++;
        return n < 5;
      });
      assert.ok(engine.getMetrics().sampleCount > 0);
    });

    it("lagThreshold=0 时使用默认阈值50，高延迟循环触发 highLagCount", async () => {
      const engine = new ZeroLatencyLoopEngine({
        lagThreshold: 0,
        yieldAfterEachLoop: false,
      });
      let n = 0;
      await engine.start(async () => {
        n++;
        // 第一次循环延迟 55ms，确保 lag > 50（默认阈值）
        if (n === 1) await new Promise<void>((r) => setTimeout(r, 55));
        return n < 2;
      });
      assert.ok(engine.getMetrics().highLagCount > 0);
    });

    it("onMetricsUpdate 在每 100 次采样后回调", async () => {
      let updateCount = 0;
      const engine = new ZeroLatencyLoopEngine({
        yieldAfterEachLoop: false,
        onMetricsUpdate: () => {
          updateCount++;
        },
      });
      let n = 0;
      await engine.start(() => {
        n++;
        return n < 101;
      });
      assert.equal(updateCount, 1);
    });

    it("getMetrics 返回快照（不受后续修改影响）", async () => {
      const engine = new ZeroLatencyLoopEngine({ yieldAfterEachLoop: false });
      let n = 0;
      await engine.start(() => {
        n++;
        return n < 2;
      });
      const snapshot = engine.getMetrics();
      engine.resetMetrics();
      assert.ok(snapshot.sampleCount > 0);
    });

    it("resetMetrics 清零所有指标", async () => {
      const engine = new ZeroLatencyLoopEngine({ yieldAfterEachLoop: false });
      let n = 0;
      await engine.start(() => {
        n++;
        return n < 3;
      });
      engine.resetMetrics();
      const m = engine.getMetrics();
      assert.equal(m.sampleCount, 0);
      assert.equal(m.avgLag, 0);
    });
  });

  describe("createZeroLatencyLoop", () => {
    it("工厂函数返回实例", () => {
      const engine = createZeroLatencyLoop({ lagThreshold: 10 });
      assert.ok(engine instanceof ZeroLatencyLoopEngine);
      assert.equal(engine.running(), false);
    });
  });
});

describe("MicrotaskBatcher", () => {
  it("add 后任务异步执行", async () => {
    const batcher = new MicrotaskBatcher();
    let ran = false;
    batcher.add(() => {
      ran = true;
    });
    assert.equal(ran, false); // 同步时未执行
    await Promise.resolve(); // 让出到微任务队列
    assert.equal(ran, true);
  });

  it("批量任务全部执行", async () => {
    const batcher = new MicrotaskBatcher();
    const results: number[] = [];
    batcher.add(() => results.push(1));
    batcher.add(() => results.push(2));
    batcher.add(() => results.push(3));
    await Promise.resolve();
    assert.deepEqual(results, [1, 2, 3]);
  });

  it("pendingCount 在 flush 前为任务数", () => {
    const batcher = new MicrotaskBatcher();
    batcher.add(() => {});
    batcher.add(() => {});
    assert.equal(batcher.pendingCount, 2);
  });

  it("任务异常时调用 errorCallback", async () => {
    let caught: unknown = null;
    const batcher = new MicrotaskBatcher({
      errorCallback: (err) => {
        caught = err;
      },
    });
    batcher.add(() => {
      throw new Error("task error");
    });
    await Promise.resolve();
    assert.ok(caught instanceof Error);
  });

  it("无 errorCallback 时任务异常由 console.error 兜底不向外传播", async () => {
    const batcher = new MicrotaskBatcher(); // 不设 errorCallback
    let consoleErrorCalled = false;
    const origError = console.error;
    console.error = () => {
      consoleErrorCalled = true;
    };
    try {
      batcher.add(() => {
        throw new Error("silent error");
      });
      await Promise.resolve();
    } finally {
      console.error = origError;
    }
    assert.equal(consoleErrorCalled, true);
  });

  it("createMicrotaskBatcher 工厂函数", () => {
    const b = createMicrotaskBatcher();
    assert.ok(b instanceof MicrotaskBatcher);
  });
});

describe("NonBlockingExecutor", () => {
  it("execute 执行任务并返回结果", async () => {
    const executor = new NonBlockingExecutor();
    const result = await executor.execute(() => 42);
    assert.equal(result, 42);
  });

  it("execute 异常时 reject Promise", async () => {
    const executor = new NonBlockingExecutor();
    await assert.rejects(
      () =>
        executor.execute(() => {
          throw new Error("bad");
        }),
      { message: "bad" },
    );
  });

  it("executeAll 并行执行多个任务", async () => {
    const executor = new NonBlockingExecutor();
    const results = await executor.executeAll([() => 1, () => 2, () => 3]);
    assert.deepEqual(results, [1, 2, 3]);
  });
});
