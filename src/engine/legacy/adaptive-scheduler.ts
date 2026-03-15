/**
 * 🦞 龙虾自适应调度器
 *
 * 根据系统负载动态调整行为
 * - 自适应让出：高负载时增加 setImmediate 频率
 * - 优先级调度：根据任务优先级和系统状态动态排序
 * - 紧急降级：过载时自动降级非关键任务
 *
 * @see {@link https://medium.com/@hadiyolworld007/node-js-performance-tuning-in-2026-event-loop-lag-fetch-backpressure-and-the-metrics-that-dff27b319415}
 */

import type { AdvancedEventLoopMetrics } from "./advanced-metrics.js";

/**
 * 负载等级
 */
export enum LoadLevel {
  /** 空闲 - 无限制 */
  IDLE = "IDLE",
  /** 正常 - 正常运行 */
  NORMAL = "NORMAL",
  /** 高负载 - 需要优化 */
  HIGH = "HIGH",
  /** 过载 - 紧急降级 */
  OVERLOAD = "OVERLOAD",
}

/**
 * 任务优先级
 */
export enum TaskPriority {
  /** 紧急 - 系统关键 */
  CRITICAL = 0,
  /** 高 - 重要任务 */
  HIGH = 1,
  /** 中 - 常规任务 */
  MEDIUM = 2,
  /** 低 - 可延迟 */
  LOW = 3,
}

/**
 * 调度任务
 */
export interface ScheduledTask {
  /** 任务 ID */
  id: string;
  /** 任务名称 */
  name: string;
  /** 优先级 */
  priority: TaskPriority;
  /** 任务函数 */
  fn: () => Promise<void> | void;
  /** 创建时间 */
  createdAt: number;
  /** 尝试次数 */
  attempts: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 是否可降级 */
  canDegrade: boolean;
  /** 依赖的任务 ID */
  dependencies?: string[];
}

/**
 * 调度器配置
 */
export interface SchedulerConfig {
  /** 最大并发任务数 */
  maxConcurrent?: number;
  /** 队列最大长度 */
  maxQueueSize?: number;
  /** 降级阈值（负载等级） */
  degradeThreshold?: LoadLevel;
}

/**
 * 默认配置
 */
const DEFAULT_SCHEDULER_CONFIG: Required<SchedulerConfig> = {
  maxConcurrent: 10,
  maxQueueSize: 1000,
  degradeThreshold: LoadLevel.HIGH,
};

/**
 * 自适应调度器
 */
export class AdaptiveScheduler {
  private queue: ScheduledTask[] = [];
  private running = new Set<string>();
  private completed = new Map<string, any>();
  private failed = new Map<string, Error>();
  private config: Required<SchedulerConfig>;

  // 状态
  private currentLoadLevel: LoadLevel = LoadLevel.IDLE;
  private isDegraded = false;

  // 回调
  private onTaskComplete?: (taskId: string, result: any) => void;
  private onTaskFailed?: (taskId: string, error: Error) => void;

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  }

  /**
   * 添加任务
   */
  schedule(task: Omit<ScheduledTask, "id" | "createdAt" | "attempts">): string {
    const taskId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const scheduledTask: ScheduledTask = {
      ...task,
      id: taskId,
      createdAt: Date.now(),
      attempts: 0,
    };

    // 检查队列容量
    if (this.queue.length >= this.config.maxQueueSize) {
      // 如果新任务优先级高于队列中最低优先级任务，则替换
      const lowestPriorityIndex = this.queue
        .map((t, i) => ({ t, index: i }))
        .sort((a, b) => b.t.priority - a.t.priority)[0]?.index;

      if (
        lowestPriorityIndex !== undefined &&
        scheduledTask.priority < this.queue[lowestPriorityIndex].priority
      ) {
        // 移除低优先级任务
        const removed = this.queue.splice(lowestPriorityIndex, 1)[0];
        this.failed.set(removed.id, new Error("队列已满，低优先级任务被移除"));
        console.warn(`🦞 任务 ${removed.name} 被移除`);
      } else {
        throw new Error("队列已满且新任务优先级不够高");
      }
    }

    this.queue.push(scheduledTask);
    this.sortQueue();

    console.log(
      `🦞 任务已调度: ${task.name} (优先级: ${TaskPriority[scheduledTask.priority]})`,
    );

    return taskId;
  }

  /**
   * 排序队列（按优先级和创建时间）
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * 获取下一个可执行任务
   */
  getNextTask(): ScheduledTask | undefined {
    // 检查依赖
    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i];

      // 检查依赖是否完成
      if (task.dependencies) {
        const allDependenciesComplete = task.dependencies.every((depId) =>
          this.completed.has(depId),
        );

        if (!allDependenciesComplete) {
          continue; // 跳过依赖未完成的任务
        }
      }

      // 检查是否需要降级
      if (
        this.isDegraded &&
        task.canDegrade &&
        task.priority > TaskPriority.CRITICAL
      ) {
        continue; // 跳过可降级的非关键任务
      }

      // 检查并发限制
      if (this.running.size >= this.config.maxConcurrent) {
        break;
      }

      // 从队列中移除
      this.queue.splice(i, 1);

      return task;
    }

    return undefined;
  }

  /**
   * 执行下一个任务
   */
  async executeNext(): Promise<boolean> {
    const task = this.getNextTask();
    if (!task) {
      return false;
    }

    this.running.add(task.id);

    try {
      const result = await task.fn();

      this.completed.set(task.id, result);
      this.running.delete(task.id);

      if (this.onTaskComplete) {
        this.onTaskComplete(task.id, result);
      }

      console.log(`✅ 任务完成: ${task.name}`);
      return true;
    } catch (error) {
      this.running.delete(task.id);
      const err = error as Error;

      // 检查是否重试
      if (task.attempts < task.maxRetries) {
        task.attempts++;
        this.queue.push(task);
        this.sortQueue();
        console.warn(
          `⚠️ 任务失败，将重试: ${task.name} (${task.attempts}/${task.maxRetries})`,
        );
      } else {
        this.failed.set(task.id, err);

        if (this.onTaskFailed) {
          this.onTaskFailed(task.id, err);
        }

        console.error(`❌ 任务失败: ${task.name} - ${err.message}`);
      }
      return true;
    }
  }

  /**
   * 批量执行任务
   */
  async executeBatch(maxTasks?: number): Promise<number> {
    const executedCount = maxTasks ?? this.config.maxConcurrent;
    let count = 0;

    for (let i = 0; i < executedCount; i++) {
      const hasTask = await this.executeNext();
      if (!hasTask) {
        break;
      }
      count++;
    }

    return count;
  }

  /**
   * 更新负载等级
   */
  updateLoadLevel(metrics: AdvancedEventLoopMetrics): void {
    const { healthStatus, backpressureLevel, p95Lag } = metrics;

    switch (healthStatus) {
      case "unhealthy":
        this.currentLoadLevel = LoadLevel.OVERLOAD;
        this.isDegraded = true;
        break;
      case "degraded":
        this.currentLoadLevel = LoadLevel.HIGH;
        this.isDegraded = true;
        break;
      case "healthy":
        if (backpressureLevel < 5 && p95Lag < 50) {
          this.currentLoadLevel = LoadLevel.NORMAL;
          this.isDegraded = false;
        } else if (backpressureLevel < 3 && p95Lag < 20) {
          this.currentLoadLevel = LoadLevel.IDLE;
          this.isDegraded = false;
        }
        break;
    }

    // 自动调整并发数
    this.adjustConcurrency(metrics);
  }

  /**
   * 根据负载调整并发数
   */
  private adjustConcurrency(metrics: AdvancedEventLoopMetrics): void {
    const baseConcurrency = DEFAULT_SCHEDULER_CONFIG.maxConcurrent;
    const { healthStatus, backpressureLevel, p95Lag } = metrics;

    let newMaxConcurrent = baseConcurrency;

    switch (healthStatus) {
      case "unhealthy":
        // 大幅减少并发
        newMaxConcurrent = Math.max(1, Math.floor(baseConcurrency / 4));
        break;
      case "degraded":
        // 适度减少并发
        newMaxConcurrent = Math.max(2, Math.floor(baseConcurrency / 2));
        break;
      case "healthy":
        if (p95Lag < 20 && backpressureLevel < 3) {
          // 低负载时可以增加并发
          newMaxConcurrent = Math.min(baseConcurrency * 2, baseConcurrency * 4);
        } else {
          newMaxConcurrent = baseConcurrency;
        }
        break;
    }

    this.config.maxConcurrent = Math.max(1, Math.floor(newMaxConcurrent));
  }

  /**
   * 计算自适应让出延迟
   */
  calculateAdaptiveYieldDelay(metrics: AdvancedEventLoopMetrics): number {
    const { p95Lag, backpressureLevel } = metrics;

    // 基础延迟
    let delay = 0;

    // 根据背压等级增加延迟
    if (backpressureLevel >= 8) {
      delay = 100; // 严重背压
    } else if (backpressureLevel >= 5) {
      delay = 50; // 高背压
    } else if (backpressureLevel >= 3) {
      delay = 10; // 中等背压
    }

    // 根据 P95 延迟增加延迟
    if (p95Lag > 100) {
      delay = Math.max(delay, 200);
    } else if (p95Lag > 50) {
      delay = Math.max(delay, 50);
    }

    return delay;
  }

  /**
   * 检查是否应该让出控制权
   */
  shouldYield(metrics: AdvancedEventLoopMetrics): boolean {
    return this.calculateAdaptiveYieldDelay(metrics) > 0;
  }

  /**
   * 获取队列状态
   */
  getQueueStats(): {
    queueLength: number;
    runningCount: number;
    completedCount: number;
    failedCount: number;
    maxConcurrent: number;
    loadLevel: LoadLevel;
    isDegraded: boolean;
  } {
    return {
      queueLength: this.queue.length,
      runningCount: this.running.size,
      completedCount: this.completed.size,
      failedCount: this.failed.size,
      maxConcurrent: this.config.maxConcurrent,
      loadLevel: this.currentLoadLevel,
      isDegraded: this.isDegraded,
    };
  }

  /**
   * 设置任务完成回调
   */
  setTaskCompleteCallback(
    callback: (taskId: string, result: any) => void,
  ): void {
    this.onTaskComplete = callback;
  }

  /**
   * 设置任务失败回调
   */
  setTaskFailedCallback(
    callback: (taskId: string, error: Error) => void,
  ): void {
    this.onTaskFailed = callback;
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue = [];
    this.running.clear();
    this.completed.clear();
    this.failed.clear();
    this.isDegraded = false;
    this.currentLoadLevel = LoadLevel.IDLE;
  }

  /**
   * 获取负载等级
   */
  getLoadLevel(): LoadLevel {
    return this.currentLoadLevel;
  }

  /**
   * 检查是否降级模式
   */
  isDegradedMode(): boolean {
    return this.isDegraded;
  }
}

/**
 * 创建自适应调度器
 */
export function createAdaptiveScheduler(
  config?: Partial<SchedulerConfig>,
): AdaptiveScheduler {
  return new AdaptiveScheduler(config);
}
