import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AutonomousTaskPlanner,
  TaskPriority,
  TaskStatus,
  TaskType,
  createPlanner,
} from "../src/engine/task-planner.js";
import type { OpenClawPluginServiceContext } from "../src/types.js";
import type { AutonomousTask } from "../src/engine/task-planner.js";

function makeCtx() {
  return {} as unknown as OpenClawPluginServiceContext;
}

function makeAnalyzeTask(
  overrides: Partial<AutonomousTask> = {},
): AutonomousTask {
  const now = Date.now();
  return {
    id: "analyze-workspace",
    type: TaskType.ANALYZE,
    priority: TaskPriority.HIGH,
    description: "分析工作区状态，识别可优化的地方",
    status: TaskStatus.COMPLETED,
    dependencies: [],
    createdAt: now,
    updatedAt: now, // 刚刚更新 → needsWorkspaceAnalysis=false
    failureCount: 0,
    maxRetries: 3,
    executionHistory: [],
    ...overrides,
  };
}

describe("TaskPriority", () => {
  it("包含所有优先级", () => {
    assert.equal(TaskPriority.CRITICAL, "critical");
    assert.equal(TaskPriority.HIGH, "high");
    assert.equal(TaskPriority.MEDIUM, "medium");
    assert.equal(TaskPriority.LOW, "low");
  });
});

describe("TaskStatus", () => {
  it("包含所有状态", () => {
    assert.equal(TaskStatus.PENDING, "pending");
    assert.equal(TaskStatus.IN_PROGRESS, "in_progress");
    assert.equal(TaskStatus.COMPLETED, "completed");
    assert.equal(TaskStatus.FAILED, "failed");
    assert.equal(TaskStatus.SKIPPED, "skipped");
  });
});

describe("TaskType", () => {
  it("包含所有类型", () => {
    assert.equal(TaskType.ANALYZE, "analyze");
    assert.equal(TaskType.PLAN, "plan");
    assert.equal(TaskType.EXECUTE, "execute");
    assert.equal(TaskType.VERIFY, "verify");
    assert.equal(TaskType.LEARN, "learn");
    assert.equal(TaskType.MAINTAIN, "maintain");
  });
});

describe("AutonomousTaskPlanner", () => {
  describe("constructor & getContext", () => {
    it("初始上下文包含默认目标", () => {
      const planner = new AutonomousTaskPlanner();
      const ctx = planner.getContext();
      assert.ok(ctx.currentGoal.length > 0);
      assert.deepEqual(ctx.completedTasks, []);
      assert.deepEqual(ctx.activeTasks, []);
      assert.deepEqual(ctx.errorHistory, []);
    });

    it("getContext 返回副本（修改不影响内部状态）", () => {
      const planner = new AutonomousTaskPlanner();
      const ctx = planner.getContext();
      ctx.currentGoal = "modified";
      assert.notEqual(planner.getContext().currentGoal, "modified");
    });
  });

  describe("updateContext", () => {
    it("合并部分字段", () => {
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({ currentGoal: "新目标" });
      assert.equal(planner.getContext().currentGoal, "新目标");
    });

    it("只更新指定字段，其他字段保持不变", () => {
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({ currentGoal: "目标A" });
      assert.deepEqual(planner.getContext().completedTasks, []);
    });
  });

  describe("planNextAction", () => {
    it("空状态默认返回工作区分析任务", async () => {
      const planner = new AutonomousTaskPlanner();
      const result = await planner.planNextAction(makeCtx());
      assert.equal(result.task.type, TaskType.ANALYZE);
      assert.ok(result.task.description.includes("分析工作区"));
      assert.ok(result.confidence > 0 && result.confidence <= 1);
      assert.ok(result.reasoning.length > 0);
    });

    it("存在未解决错误时返回错误恢复任务", async () => {
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({
        errorHistory: [
          { error: "file read failed", timestamp: Date.now(), resolved: false },
        ],
      });
      const result = await planner.planNextAction(makeCtx());
      assert.equal(result.task.type, TaskType.EXECUTE);
      assert.ok(result.task.description.includes("错误恢复"));
    });

    it("timeout 错误生成超时恢复行动", async () => {
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({
        errorHistory: [
          {
            error: "request timeout exceeded",
            timestamp: Date.now(),
            resolved: false,
          },
        ],
      });
      const result = await planner.planNextAction(makeCtx());
      assert.ok(result.task.description.includes("增加超时时间"));
    });

    it("memory 错误生成内存恢复行动", async () => {
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({
        errorHistory: [
          { error: "out of memory", timestamp: Date.now(), resolved: false },
        ],
      });
      const result = await planner.planNextAction(makeCtx());
      assert.ok(result.task.description.includes("清理缓存"));
    });

    it("permission 错误生成权限恢复行动", async () => {
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({
        errorHistory: [
          {
            error: "permission denied",
            timestamp: Date.now(),
            resolved: false,
          },
        ],
      });
      const result = await planner.planNextAction(makeCtx());
      assert.ok(result.task.description.includes("权限"));
    });

    it("network 错误生成网络恢复行动", async () => {
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({
        errorHistory: [
          {
            error: "network connection failed",
            timestamp: Date.now(),
            resolved: false,
          },
        ],
      });
      const result = await planner.planNextAction(makeCtx());
      assert.ok(result.task.description.includes("重试请求"));
    });

    it("未解决 CRITICAL 错误触发安全检查（最高优先）", async () => {
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({
        errorHistory: [
          {
            error: "CRITICAL system failure",
            timestamp: Date.now(),
            resolved: false,
          },
        ],
      });
      const result = await planner.planNextAction(makeCtx());
      // 安全检查优先（CRITICAL 关键字）
      assert.equal(result.task.type, TaskType.ANALYZE);
      assert.equal(result.task.priority, TaskPriority.CRITICAL);
      assert.ok(result.confidence >= 0.9);
    });

    it("最近1分钟内5次失败触发安全分析", async () => {
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({
        errorHistory: Array.from({ length: 5 }, () => ({
          error: "some error",
          timestamp: Date.now() - 1000, // 1秒前，在1分钟内
          resolved: false,
        })),
      });
      const result = await planner.planNextAction(makeCtx());
      assert.equal(result.task.type, TaskType.ANALYZE);
      assert.equal(result.task.priority, TaskPriority.CRITICAL);
    });

    it("已解决错误不触发恢复（走正常流程）", async () => {
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({
        errorHistory: [
          { error: "old error", timestamp: Date.now(), resolved: true },
        ],
      });
      const result = await planner.planNextAction(makeCtx());
      // 无未解决错误，走正常分析流程
      assert.equal(result.task.type, TaskType.ANALYZE);
      assert.ok(result.task.description.includes("分析工作区"));
    });

    it("completedTasks 达到 50 时触发上下文压缩", async () => {
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({
        completedTasks: Array.from({ length: 50 }, (_, i) => `task-${i}`),
      });
      const result = await planner.planNextAction(makeCtx());
      assert.equal(result.task.type, TaskType.MAINTAIN);
      assert.ok(result.task.description.includes("压缩"));
    });

    it("有 PENDING 任务时按优先级选择（HIGH 先于 LOW）", async () => {
      const now = Date.now();
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({
        activeTasks: [
          makeAnalyzeTask(), // 使 needsWorkspaceAnalysis=false
          {
            id: "t-low",
            type: TaskType.EXECUTE,
            priority: TaskPriority.LOW,
            description: "低优先级任务",
            status: TaskStatus.PENDING,
            dependencies: [],
            createdAt: now,
            updatedAt: now,
            failureCount: 0,
            maxRetries: 3,
            executionHistory: [],
          },
          {
            id: "t-high",
            type: TaskType.EXECUTE,
            priority: TaskPriority.HIGH,
            description: "高优先级任务",
            status: TaskStatus.PENDING,
            dependencies: [],
            createdAt: now,
            updatedAt: now,
            failureCount: 0,
            maxRetries: 3,
            executionHistory: [],
          },
        ],
      });
      const result = await planner.planNextAction(makeCtx());
      assert.equal(result.task.id, "t-high");
    });

    it("无待处理任务时返回维护任务", async () => {
      const planner = new AutonomousTaskPlanner();
      planner.updateContext({ activeTasks: [makeAnalyzeTask()] }); // COMPLETED 状态
      const result = await planner.planNextAction(makeCtx());
      assert.equal(result.task.type, TaskType.MAINTAIN);
    });

    it("结果包含有效的 task 对象结构", async () => {
      const planner = new AutonomousTaskPlanner();
      const result = await planner.planNextAction(makeCtx());
      const t = result.task;
      assert.ok(typeof t.id === "string" && t.id.length > 0);
      assert.ok(Object.values(TaskType).includes(t.type));
      assert.ok(Object.values(TaskPriority).includes(t.priority));
      assert.equal(t.status, TaskStatus.PENDING);
      assert.equal(typeof t.failureCount, "number");
    });
  });

  describe("markTaskCompleted", () => {
    it("成功完成时添加到 completedTasks", async () => {
      const planner = new AutonomousTaskPlanner();
      const result = await planner.planNextAction(makeCtx());
      const task = result.task;
      planner.updateContext({ activeTasks: [task] });
      planner.markTaskCompleted(task.id, {
        timestamp: Date.now(),
        success: true,
        summary: "done",
      });
      const ctx = planner.getContext();
      assert.ok(ctx.completedTasks.includes(task.id));
    });

    it("失败结果不添加到 completedTasks", async () => {
      const planner = new AutonomousTaskPlanner();
      const result = await planner.planNextAction(makeCtx());
      const task = result.task;
      planner.updateContext({ activeTasks: [task] });
      planner.markTaskCompleted(task.id, {
        timestamp: Date.now(),
        success: false,
        summary: "fail",
      });
      const ctx = planner.getContext();
      assert.ok(!ctx.completedTasks.includes(task.id));
    });

    it("将任务状态设为 COMPLETED", async () => {
      const planner = new AutonomousTaskPlanner();
      const result = await planner.planNextAction(makeCtx());
      const task = result.task;
      planner.updateContext({ activeTasks: [task] });
      planner.markTaskCompleted(task.id, {
        timestamp: Date.now(),
        success: true,
        summary: "ok",
      });
      const updated = planner
        .getContext()
        .activeTasks.find((t) => t.id === task.id);
      assert.equal(updated?.status, TaskStatus.COMPLETED);
    });

    it("不存在的 taskId 不抛出", () => {
      const planner = new AutonomousTaskPlanner();
      assert.doesNotThrow(() =>
        planner.markTaskCompleted("nonexistent", {
          timestamp: Date.now(),
          success: true,
          summary: "ok",
        }),
      );
    });
  });

  describe("markTaskFailed", () => {
    it("增加 failureCount", async () => {
      const planner = new AutonomousTaskPlanner();
      const result = await planner.planNextAction(makeCtx());
      const task = { ...result.task, maxRetries: 3 };
      planner.updateContext({ activeTasks: [task] });
      planner.markTaskFailed(task.id, "err");
      const updated = planner
        .getContext()
        .activeTasks.find((t) => t.id === task.id);
      assert.equal(updated?.failureCount, 1);
    });

    it("达到 maxRetries 后状态变为 FAILED", async () => {
      const planner = new AutonomousTaskPlanner();
      const result = await planner.planNextAction(makeCtx());
      const task = { ...result.task, maxRetries: 1, failureCount: 0 };
      planner.updateContext({ activeTasks: [task] });
      planner.markTaskFailed(task.id, "fatal");
      const updated = planner
        .getContext()
        .activeTasks.find((t) => t.id === task.id);
      assert.equal(updated?.status, TaskStatus.FAILED);
    });

    it("未达到 maxRetries 不设为 FAILED", async () => {
      const planner = new AutonomousTaskPlanner();
      const result = await planner.planNextAction(makeCtx());
      const task = { ...result.task, maxRetries: 3, failureCount: 0 };
      planner.updateContext({ activeTasks: [task] });
      planner.markTaskFailed(task.id, "err");
      const updated = planner
        .getContext()
        .activeTasks.find((t) => t.id === task.id);
      assert.notEqual(updated?.status, TaskStatus.FAILED);
    });
  });

  describe("createPlanner", () => {
    it("返回 AutonomousTaskPlanner 实例", () => {
      assert.ok(createPlanner() instanceof AutonomousTaskPlanner);
    });
  });
});
