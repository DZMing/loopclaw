/**
 * 🦞 龙虾监督者代理
 *
 * 实现监督者模式（Supervisor Pattern）用于多代理编排
 * 基于 2026 AI Agent 架构最佳实践
 *
 * @see {@link https://redis.io/blog/ai-agent-architecture/}
 * @see {@link https://www.openlayer.com/blog/post/multi-agent-system-architecture-guide}
 * @see {@link https://levelup.gitconnected.com/the-2026-roadmap-to-ai-agent-mastery-5e43756c0f26}
 */

import type { FlameGraphData } from "./flame-graph-collector.js";

/**
 * 代理状态
 */
export enum AgentStatus {
  /** 空闲 */
  IDLE = "idle",
  /** 运行中 */
  RUNNING = "running",
  /** 等待 */
  WAITING = "waiting",
  /** 完成 */
  COMPLETED = "completed",
  /** 失败 */
  FAILED = "failed",
  /** 已停止 */
  STOPPED = "stopped",
}

/**
 * 代理类型
 */
export enum AgentType {
  /** 循环引擎 */
  LOOP_ENGINE = "loop_engine",
  /** 分析器 */
  ANALYZER = "analyzer",
  /** 修复器 */
  FIXER = "fixer",
  /** 规划器 */
  PLANNER = "planner",
  /** 监控器 */
  MONITOR = "monitor",
  /** 自定义 */
  CUSTOM = "custom",
}

/**
 * 代理任务
 */
export interface AgentTask {
  /** 任务ID */
  id: string;
  /** 任务名称 */
  name: string;
  /** 任务描述 */
  description?: string;
  /** 任务函数 */
  fn: () => Promise<void> | void;
  /** 优先级 (0-10, 0最高) */
  priority: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 重试次数 */
  retries: number;
  /** 依赖的任务ID */
  dependencies?: string[];
  /** 创建时间 */
  createdAt: number;
  /** 开始时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
  /** 结果 */
  result?: any;
  /** 错误 */
  error?: Error;
}

/**
 * 代理配置
 */
export interface AgentConfig {
  /** 代理ID */
  id: string;
  /** 代理名称 */
  name: string;
  /** 代理类型 */
  type: AgentType | string;
  /** 最大并发任务数 */
  maxConcurrent?: number;
  /** 心跳间隔（毫秒） */
  heartbeatInterval?: number;
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * 代理实例
 */
export interface AgentInstance {
  /** 代理配置 */
  config: AgentConfig;
  /** 当前状态 */
  status: AgentStatus;
  /** 当前任务 */
  currentTask?: AgentTask;
  /** 已完成任务数 */
  completedTasks: number;
  /** 失败任务数 */
  failedTasks: number;
  /** 总耗时（毫秒） */
  totalDuration: number;
  /** 最后心跳时间 */
  lastHeartbeat: number;
  /** 性能数据 */
  performanceData: {
    avgTaskDuration: number;
    successRate: number;
  };
}

/**
 * 监督者配置
 */
export interface SupervisorConfig {
  /** 最大并发代理数 */
  maxConcurrentAgents?: number;
  /** 任务队列最大长度 */
  maxQueueSize?: number;
  /** 启用火焰图收集 */
  enableFlameGraph?: boolean;
  /** 启用自动重启失败代理 */
  enableAutoRestart?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
}

/**
 * 任务分配策略
 */
export enum AssignmentStrategy {
  /** 轮询 */
  ROUND_ROBIN = "round_robin",
  /** 最少负载 */
  LEAST_LOADED = "least_loaded",
  /** 优先级优先 */
  PRIORITY_FIRST = "priority_first",
  /** 随机 */
  RANDOM = "random",
}

/**
 * 监督者事件
 */
export interface SupervisorEvent {
  /** 事件类型 */
  type:
    | "agent_started"
    | "agent_completed"
    | "agent_failed"
    | "task_assigned"
    | "task_completed"
    | "task_failed";
  /** 代理ID */
  agentId?: string;
  /** 任务ID */
  taskId?: string;
  /** 时间戳 */
  timestamp: number;
  /** 数据 */
  data?: any;
}

/**
 * 监督者状态
 */
export interface SupervisorStatus {
  /** 运行中的代理数 */
  runningAgents: number;
  /** 等待中的任务数 */
  pendingTasks: number;
  /** 已完成任务数 */
  completedTasks: number;
  /** 失败任务数 */
  failedTasks: number;
  /** 平均任务耗时 */
  avgTaskDuration: number;
  /** 系统健康状态 */
  healthStatus: "healthy" | "degraded" | "unhealthy";
}

/**
 * 监督者代理
 *
 * 管理多个 AI Agent 的编排和调度
 */
export class SupervisorAgent {
  private agents: Map<string, AgentInstance> = new Map();
  private taskQueue: AgentTask[] = [];
  private completedTasks: Map<string, AgentTask> = new Map();
  private failedTasks: Map<string, AgentTask> = new Map();
  private config: Required<SupervisorConfig>;
  private isRunning = false;
  private assignmentStrategy: AssignmentStrategy =
    AssignmentStrategy.LEAST_LOADED;
  private eventListeners: Map<string, (event: SupervisorEvent) => void> =
    new Map();

  // 性能数据
  private flameGraphData?: FlameGraphData;
  private startTime = 0;

  constructor(config: SupervisorConfig = {}) {
    this.config = {
      maxConcurrentAgents: 10,
      maxQueueSize: 1000,
      enableFlameGraph: true,
      enableAutoRestart: true,
      maxRetries: 3,
      ...config,
    };
  }

  /**
   * 注册代理
   */
  registerAgent(config: AgentConfig): void {
    const agent: AgentInstance = {
      config: { ...config, enabled: config.enabled ?? true },
      status: AgentStatus.IDLE,
      completedTasks: 0,
      failedTasks: 0,
      totalDuration: 0,
      lastHeartbeat: Date.now(),
      performanceData: {
        avgTaskDuration: 0,
        successRate: 1,
      },
    };

    this.agents.set(config.id, agent);
    console.log(`🦞 注册代理: ${config.name} (${config.id})`);
  }

  /**
   * 注销代理
   */
  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent && agent.status === AgentStatus.RUNNING) {
      this.stopAgent(agentId);
    }
    this.agents.delete(agentId);
    console.log(`🦞 注销代理: ${agentId}`);
  }

  /**
   * 添加任务
   */
  addTask(task: Omit<AgentTask, "id" | "createdAt" | "retries">): string {
    if (this.taskQueue.length >= this.config.maxQueueSize) {
      throw new Error("任务队列已满");
    }

    const taskWithId: AgentTask = {
      ...task,
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      retries: 0,
    };

    this.taskQueue.push(taskWithId);
    this.sortTaskQueue();

    // 尝试立即分配任务
    this.assignTasks();

    return taskWithId.id;
  }

  /**
   * 启动监督者
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();

    console.log("🦞 监督者代理已启动");

    // 主调度循环
    this.schedule();
  }

  /**
   * 停止监督者
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    // 停止所有运行中的代理
    for (const [agentId, agent] of this.agents) {
      if (agent.status === AgentStatus.RUNNING) {
        await this.stopAgent(agentId);
      }
    }

    console.log("🦞 监督者代理已停止");
  }

  /**
   * 获取状态
   */
  getStatus(): SupervisorStatus {
    const runningAgents = Array.from(this.agents.values()).filter(
      (a) => a.status === AgentStatus.RUNNING,
    ).length;

    const totalCompleted = this.completedTasks.size;
    const totalFailed = this.failedTasks.size;
    const totalTasks = totalCompleted + totalFailed;

    const completedTaskList = Array.from(this.completedTasks.values());
    const avgTaskDuration =
      totalTasks > 0
        ? completedTaskList.reduce(
            (sum, t) => sum + (t.completedAt! - t.startedAt!),
            0,
          ) / totalTasks
        : 0;

    // 计算健康状态
    let healthStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    const failureRate = totalTasks > 0 ? totalFailed / totalTasks : 0;

    if (failureRate > 0.5 || runningAgents === 0) {
      healthStatus = "unhealthy";
    } else if (failureRate > 0.1 || this.taskQueue.length > 100) {
      healthStatus = "degraded";
    }

    return {
      runningAgents,
      pendingTasks: this.taskQueue.length,
      completedTasks: totalCompleted,
      failedTasks: totalFailed,
      avgTaskDuration,
      healthStatus,
    };
  }

  /**
   * 获取代理状态
   */
  getAgentStatus(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 获取所有代理状态
   */
  getAllAgentStatus(): Map<string, AgentInstance> {
    return new Map(this.agents);
  }

  /**
   * 设置任务分配策略
   */
  setAssignmentStrategy(strategy: AssignmentStrategy): void {
    this.assignmentStrategy = strategy;
  }

  /**
   * 添加事件监听器
   */
  on(event: string, listener: (event: SupervisorEvent) => void): void {
    this.eventListeners.set(event, listener);
  }

  /**
   * 主调度循环
   */
  private async schedule(): Promise<void> {
    while (this.isRunning) {
      try {
        // 分配任务
        this.assignTasks();

        // 检查超时任务
        this.checkTimeouts();

        // 自动重启失败代理
        if (this.config.enableAutoRestart) {
          this.restartFailedAgents();
        }

        // 让出控制权
        await new Promise((resolve) => setImmediate(resolve));
      } catch (error) {
        console.error("🦞 调度错误:", error);
      }
    }
  }

  /**
   * 分配任务
   */
  private assignTasks(): void {
    // 获取可用代理
    const availableAgents = Array.from(this.agents.values()).filter(
      (a) => a.status === AgentStatus.IDLE && a.config.enabled,
    );

    if (availableAgents.length === 0 || this.taskQueue.length === 0) {
      return;
    }

    // 按策略选择代理和任务
    for (const agent of availableAgents) {
      if (this.taskQueue.length === 0) {
        break;
      }

      const task = this.selectTask(agent);
      if (!task) {
        continue;
      }

      // 检查依赖
      if (!this.checkDependencies(task)) {
        continue;
      }

      // 分配任务
      this.assignTaskToAgent(agent, task);
    }
  }

  /**
   * 选择任务
   */
  private selectTask(agent: AgentInstance): AgentTask | undefined {
    switch (this.assignmentStrategy) {
      case AssignmentStrategy.PRIORITY_FIRST:
        return this.taskQueue.find(
          (t) => !t.dependencies || t.dependencies.length === 0,
        );

      case AssignmentStrategy.LEAST_LOADED:
        return this.taskQueue[0];

      case AssignmentStrategy.ROUND_ROBIN:
        return this.taskQueue[
          Math.floor(Math.random() * this.taskQueue.length)
        ];

      case AssignmentStrategy.RANDOM:
        return this.taskQueue[
          Math.floor(Math.random() * this.taskQueue.length)
        ];

      default:
        return this.taskQueue[0];
    }
  }

  /**
   * 检查任务依赖
   */
  private checkDependencies(task: AgentTask): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    return task.dependencies.every((depId) => this.completedTasks.has(depId));
  }

  /**
   * 分配任务给代理
   */
  private async assignTaskToAgent(
    agent: AgentInstance,
    task: AgentTask,
  ): Promise<void> {
    // 从队列移除
    const index = this.taskQueue.findIndex((t) => t.id === task.id);
    if (index === -1) {
      return;
    }
    this.taskQueue.splice(index, 1);

    // 更新代理状态
    agent.status = AgentStatus.RUNNING;
    agent.currentTask = task;
    agent.lastHeartbeat = Date.now();

    task.startedAt = Date.now();

    // 触发事件
    this.emitEvent({
      type: "task_assigned",
      agentId: agent.config.id,
      taskId: task.id,
      timestamp: Date.now(),
    });

    // 执行任务
    this.executeTask(agent, task).catch((error) => {
      console.error(`🦞 代理 ${agent.config.id} 执行任务失败:`, error);
    });
  }

  /**
   * 执行任务
   */
  private async executeTask(
    agent: AgentInstance,
    task: AgentTask,
  ): Promise<void> {
    try {
      const startTime = Date.now();

      // 执行任务函数
      await task.fn();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 更新代理状态
      agent.status = AgentStatus.IDLE;
      agent.completedTasks++;
      agent.totalDuration += duration;
      agent.performanceData.avgTaskDuration =
        (agent.performanceData.avgTaskDuration * (agent.completedTasks - 1) +
          duration) /
        agent.completedTasks;

      // 记录完成任务
      task.completedAt = endTime;
      task.result = { duration };
      this.completedTasks.set(task.id, task);

      // 触发事件
      this.emitEvent({
        type: "task_completed",
        agentId: agent.config.id,
        taskId: task.id,
        timestamp: endTime,
        data: { duration },
      });
    } catch (error) {
      const err = error as Error;

      // 更新代理状态
      agent.status = AgentStatus.FAILED;
      agent.failedTasks++;

      // 记录失败任务
      task.completedAt = Date.now();
      task.error = err;
      this.failedTasks.set(task.id, task);

      // 触发事件
      this.emitEvent({
        type: "task_failed",
        agentId: agent.config.id,
        taskId: task.id,
        timestamp: Date.now(),
        data: { error: err.message },
      });

      // 重试逻辑
      if (task.retries < this.config.maxRetries) {
        task.retries++;
        console.log(
          `🦞 重试任务 ${task.id} (${task.retries}/${this.config.maxRetries})`,
        );
        this.taskQueue.push(task);
        this.sortTaskQueue();
      } else {
        console.error(`🦞 任务 ${task.id} 达到最大重试次数`);
      }
    } finally {
      agent.currentTask = undefined;
    }
  }

  /**
   * 停止代理
   */
  private async stopAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    agent.status = AgentStatus.STOPPED;
    agent.currentTask = undefined;
  }

  /**
   * 检查超时任务
   */
  private checkTimeouts(): void {
    const now = Date.now();

    for (const agent of this.agents.values()) {
      if (agent.status === AgentStatus.RUNNING && agent.currentTask) {
        const task = agent.currentTask;
        const elapsed = now - task.startedAt!;

        if (task.timeout && elapsed > task.timeout) {
          console.warn(
            `🦞 任务 ${task.id} 超时 (${elapsed}ms > ${task.timeout}ms)`,
          );

          // 标记任务失败
          agent.status = AgentStatus.FAILED;
          agent.failedTasks++;
          agent.currentTask = undefined;

          task.completedAt = now;
          task.error = new Error(`任务超时 (${elapsed}ms)`);
          this.failedTasks.set(task.id, task);
        }
      }
    }
  }

  /**
   * 重启失败代理
   */
  private restartFailedAgents(): void {
    for (const [agentId, agent] of this.agents) {
      if (agent.status === AgentStatus.FAILED) {
        console.log(`🦞 重启失败代理: ${agentId}`);
        agent.status = AgentStatus.IDLE;
        agent.lastHeartbeat = Date.now();
      }
    }
  }

  /**
   * 排序任务队列
   */
  private sortTaskQueue(): void {
    this.taskQueue.sort((a, b) => {
      // 先按优先级排序
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // 再按创建时间排序
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * 触发事件
   */
  private emitEvent(event: SupervisorEvent): void {
    const listener = this.eventListeners.get(event.type);
    if (listener) {
      listener(event);
    }
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport(): {
    supervisor: SupervisorStatus;
    agents: Array<{
      id: string;
      name: string;
      status: AgentStatus;
      completedTasks: number;
      failedTasks: number;
      avgDuration: number;
      successRate: number;
    }>;
    flameGraph?: FlameGraphData;
  } {
    const supervisor = this.getStatus();
    const agents = Array.from(this.agents.values()).map((agent) => ({
      id: agent.config.id,
      name: agent.config.name,
      status: agent.status,
      completedTasks: agent.completedTasks,
      failedTasks: agent.failedTasks,
      avgDuration: agent.performanceData.avgTaskDuration,
      successRate: agent.performanceData.successRate,
    }));

    return {
      supervisor,
      agents,
      flameGraph: this.flameGraphData,
    };
  }
}

/**
 * 创建监督者代理
 */
export function createSupervisorAgent(
  config?: SupervisorConfig,
): SupervisorAgent {
  return new SupervisorAgent(config);
}

/**
 * 创建标准代理配置
 */
export function createAgentConfig(
  id: string,
  name: string,
  type: AgentType | string = AgentType.CUSTOM,
  options?: Partial<AgentConfig>,
): AgentConfig {
  return {
    id,
    name,
    type,
    maxConcurrent: 1,
    heartbeatInterval: 5000,
    enabled: true,
    ...options,
  };
}
