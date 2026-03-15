import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CircuitBreaker,
  CircuitBreakerState,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "../src/engine/runtime/circuit-breaker.js";

const ok = () => Promise.resolve("ok");
const fail = () => Promise.reject(new Error("boom"));

describe("CircuitBreaker", () => {
  describe("默认配置", () => {
    it("failureThreshold 默认为 5", () => {
      assert.equal(DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold, 5);
    });

    it("halfOpenMaxCalls 默认为 3", () => {
      assert.equal(DEFAULT_CIRCUIT_BREAKER_CONFIG.halfOpenMaxCalls, 3);
    });

    it("resetTimeoutMs 默认为 60000", () => {
      assert.equal(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs, 60000);
    });
  });

  describe("CLOSED 状态（正常）", () => {
    it("初始状态为 CLOSED", () => {
      const cb = new CircuitBreaker();
      assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
    });

    it("正常调用返回结果", async () => {
      const cb = new CircuitBreaker();
      const result = await cb.execute(() => Promise.resolve(42));
      assert.equal(result, 42);
    });

    it("失败次数未达阈值时保持 CLOSED", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });
      for (let i = 0; i < 2; i++) {
        await assert.rejects(() => cb.execute(fail));
      }
      assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
    });
  });

  describe("触发熔断 → OPEN 状态", () => {
    it("失败次数达到阈值后转 OPEN", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });
      for (let i = 0; i < 3; i++) {
        await assert.rejects(() => cb.execute(fail));
      }
      assert.equal(cb.getState(), CircuitBreakerState.OPEN);
    });

    it("OPEN 状态拒绝后续请求并抛出熔断错误", async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 60000,
      });
      for (let i = 0; i < 2; i++) {
        await assert.rejects(() => cb.execute(fail));
      }
      await assert.rejects(
        () => cb.execute(ok),
        (err: Error) => {
          assert.ok(err.message.includes("Circuit Breaker"));
          assert.ok(err.message.includes("熔断中"));
          return true;
        },
      );
    });
  });

  describe("HALF_OPEN 状态（恢复测试）", () => {
    it("resetTimeoutMs 超时后转 HALF_OPEN", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 0 });
      await assert.rejects(() => cb.execute(fail));
      assert.equal(cb.getState(), CircuitBreakerState.OPEN);
      // resetTimeoutMs=0 表示立即超时，下次执行会进入 HALF_OPEN
      await cb.execute(ok);
      // 成功一次 halfOpenSuccessCount < halfOpenMaxCalls(3)，仍 HALF_OPEN
      assert.equal(cb.getState(), CircuitBreakerState.HALF_OPEN);
    });

    it("HALF_OPEN 连续成功 halfOpenMaxCalls 次后恢复 CLOSED", async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 0,
        halfOpenMaxCalls: 2,
      });
      await assert.rejects(() => cb.execute(fail));
      // 超时后进入 HALF_OPEN
      await cb.execute(ok);
      await cb.execute(ok);
      assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
    });

    it("HALF_OPEN 状态失败 → 重新 OPEN", async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 0,
        halfOpenMaxCalls: 3,
      });
      await assert.rejects(() => cb.execute(fail));
      // 超时进入 HALF_OPEN，失败一次
      await assert.rejects(() => cb.execute(fail));
      assert.equal(cb.getState(), CircuitBreakerState.OPEN);
    });
  });

  describe("reset() 方法", () => {
    it("reset 后状态恢复 CLOSED", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      await assert.rejects(() => cb.execute(fail));
      assert.equal(cb.getState(), CircuitBreakerState.OPEN);
      cb.reset();
      assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
    });

    it("reset 后可以正常执行请求", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      await assert.rejects(() => cb.execute(fail));
      cb.reset();
      const result = await cb.execute(() => Promise.resolve("recovered"));
      assert.equal(result, "recovered");
    });
  });

  describe("自定义配置", () => {
    it("自定义 failureThreshold", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 10 });
      for (let i = 0; i < 9; i++) {
        await assert.rejects(() => cb.execute(fail));
      }
      assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
      await assert.rejects(() => cb.execute(fail));
      assert.equal(cb.getState(), CircuitBreakerState.OPEN);
    });

    it("成功后 failureCount 清零", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });
      // 失败 2 次后成功
      await assert.rejects(() => cb.execute(fail));
      await assert.rejects(() => cb.execute(fail));
      await cb.execute(ok);
      // 再失败 2 次，仍应 CLOSED（计数被清零）
      await assert.rejects(() => cb.execute(fail));
      await assert.rejects(() => cb.execute(fail));
      assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
    });
  });
});
