/**
 * 🦞 龙虾自主任务规划器
 *
 * 基于 2025 年最佳实践的自主 Agent 任务规划系统。
 *
 * 核心原则：
 * - 目标导向：所有行动都服务于明确的目标
 * - 安全优先：fail-safe 设计，而非 fail-fast
 * - 上下文优化：高效管理有限的上下文资源
 * - 自我修正：从失败中学习，持续改进策略
 *
 * @see {@link https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents | Effective Context Engineering}
 * @see {@link https://www.uipath.com/blog/ai/agent-builder-best-practices | Agent Builder Best Practices}
 */

import type { OpenClawPluginServiceContext } from "../types.js";

/**
 * 任务优先级
 */
export enum TaskPriority {
  /** 关键：影响系统稳定性 */
  CRITICAL = "critical",
  /** 高：影响目标达成 */
  HIGH = "high",
  /** 中：优化改进 */
  MEDIUM = "medium",
  /** 低：探索性任务 */
  LOW = "low",
}

/**
 * 任务状态
 */
export enum TaskStatus {
  /** 待执行 */
  PENDING = "pending",
  /** 执行中 */
  IN_PROGRESS = "in_progress",
  /** 已完成 */
  COMPLETED = "completed",
  /** 失败 */
  FAILED = "failed",
  /** 跳过 */
  SKIPPED = "skipped",
}

/**
 * 任务类型
 */
export enum TaskType {
  /** 分析：检查状态、发现问题 */
  ANALYZE = "analyze",
  /** 规划：制定下一步行动 */
  PLAN = "plan",
  /** 执行：实施具体操作 */
  EXECUTE = "execute",
  /** 验证：检查结果 */
  VERIFY = "verify",
  /** 学习：从经验中改进 */
  LEARN = "learn",
  /** 维护：清理、优化 */
  MAINTAIN = "maintain",
}

/**
 * 自主任务定义
 */
export interface AutonomousTask {
  /** 任务ID */
  id: string;
  /** 任务类型 */
  type: TaskType;
  /** 任务优先级 */
  priority: TaskPriority;
  /** 任务描述 */
  description: string;
  /** 预期结果 */
  expectedOutcome?: string;
  /** 任务状态 */
  status: TaskStatus;
  /** 依赖任务ID列表 */
  dependencies: string[];
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 失败次数 */
  failureCount: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 执行历史 */
  executionHistory: TaskExecution[];
}

/**
 * 任务执行记录
 */
export interface TaskExecution {
  /** 执行时间 */
  timestamp: number;
  /** 是否成功 */
  success: boolean;
  /** 结果摘要 */
  summary: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 规划上下文
 */
export interface PlanningContext {
  /** 当前目标 */
  currentGoal: string;
  /** 已完成任务列表 */
  completedTasks: string[];
  /** 活跃任务列表 */
  activeTasks: AutonomousTask[];
  /** 错误历史 */
  errorHistory: Array<{
    error: string;
    timestamp: number;
    resolved: boolean;
  }>;
  /** 性能指标 */
  metrics: {
    /** 平均循环时间 */
    avgLoopTime: number;
    /** 成功率 */
    successRate: number;
    /** 任务吞吐量 */
    throughput: number;
  };
}

/**
 * 规划结果
 */
export interface PlanningResult {
  /** 推荐任务 */
  task: AutonomousTask;
  /** 推理过程 */
  reasoning: string;
  /** 置信度 */
  confidence: number;
}

/**
 * 龙虾自主任务规划器
 */
export class AutonomousTaskPlanner {
  private context: PlanningContext;

  constructor() {
    this.context = {
      currentGoal: "持续优化和改进",
      completedTasks: [],
      activeTasks: [],
      errorHistory: [],
      metrics: {
        avgLoopTime: 0,
        successRate: 1.0,
        throughput: 0,
      },
    };
  }

  /**
   * 更新规划上下文
   */
  updateContext(updates: Partial<PlanningContext>): void {
    this.context = { ...this.context, ...updates };
  }

  /**
   * 生成下一步任务
   *
   * 基于当前上下文和目标，自主规划下一步行动。
   * 实现目标导向推理和 fail-safe 设计原则。
   *
   * @param ctx OpenClaw 插件上下文
   * @returns Promise<PlanningResult> 规划结果
   */
  async planNextAction(
    ctx: OpenClawPluginServiceContext,
  ): Promise<PlanningResult> {
    // 阶段1：安全检查（fail-safe 原则）
    const safetyCheck = this.performSafetyCheck();
    if (safetyCheck) {
      return safetyCheck;
    }

    // 阶段2：错误恢复
    const errorRecovery = this.planErrorRecovery();
    if (errorRecovery) {
      return errorRecovery;
    }

    // 阶段3：上下文压缩（如果需要）
    const contextCompression = this.planContextCompression();
    if (contextCompression) {
      return contextCompression;
    }

    // 阶段4：目标导向任务生成
    const goalOrientedTask = this.planGoalOrientedTask(ctx);
    if (goalOrientedTask) {
      return goalOrientedTask;
    }

    // 阶段5：默认维护任务
    return this.planMaintenanceTask();
  }

  /**
   * 执行安全检查
   *
   * fail-safe 设计：优先考虑安全而非速度
   */
  private performSafetyCheck(): PlanningResult | null {
    // 检查最近的失败率
    const recentFailures = this.context.errorHistory.filter(
      (e) => Date.now() - e.timestamp < 60000, // 最近1分钟
    );

    if (recentFailures.length >= 5) {
      // 失败过多，暂停并分析
      return {
        task: this.createTask(TaskType.ANALYZE, TaskPriority.CRITICAL, {
          description: "检测到高频失败，暂停执行以分析根因",
          expectedOutcome: "识别失败模式并调整策略",
        }),
        reasoning:
          "最近1分钟内有5次失败，根据 fail-safe 原则，暂停执行以避免级联失败",
        confidence: 0.95,
      };
    }

    // 检查是否有未解决的关键错误
    const criticalErrors = this.context.errorHistory.filter(
      (e) => !e.resolved && e.error.includes("CRITICAL"),
    );

    if (criticalErrors.length > 0) {
      return {
        task: this.createTask(TaskType.ANALYZE, TaskPriority.CRITICAL, {
          description: "处理未解决的关键错误",
          expectedOutcome: "关键错误已解决或已记录",
        }),
        reasoning: "存在未解决的关键错误，必须优先处理",
        confidence: 1.0,
      };
    }

    return null;
  }

  /**
   * 规划错误恢复
   */
  private planErrorRecovery(): PlanningResult | null {
    const unresolvedErrors = this.context.errorHistory.filter(
      (e) => !e.resolved,
    );

    if (unresolvedErrors.length > 0) {
      const lastError = unresolvedErrors[unresolvedErrors.length - 1];
      const recoveryAction = this.generateRecoveryAction(lastError.error);

      return {
        task: this.createTask(TaskType.EXECUTE, TaskPriority.HIGH, {
          description: `错误恢复: ${recoveryAction}`,
          expectedOutcome: "错误已恢复或已采取缓解措施",
          dependencies: [],
        }),
        reasoning: `检测到未解决的错误: ${lastError.error}，生成恢复行动`,
        confidence: 0.85,
      };
    }

    return null;
  }

  /**
   * 规划上下文压缩
   */
  private planContextCompression(): PlanningResult | null {
    const totalTasks =
      this.context.completedTasks.length + this.context.activeTasks.length;

    // 每 50 个任务压缩一次上下文
    if (totalTasks > 0 && totalTasks % 50 === 0) {
      return {
        task: this.createTask(TaskType.MAINTAIN, TaskPriority.MEDIUM, {
          description: "压缩历史上下文，保留关键信息",
          expectedOutcome: "上下文大小减少，关键信息已保留",
        }),
        reasoning: `已完成 ${totalTasks} 个任务，根据上下文工程最佳实践，需要压缩历史记录`,
        confidence: 0.9,
      };
    }

    return null;
  }

  /**
   * 规划目标导向任务
   *
   * 基于当前目标和状态，生成下一步行动
   */
  private planGoalOrientedTask(
    ctx: OpenClawPluginServiceContext,
  ): PlanningResult | null {
    const goal = this.context.currentGoal;

    // 分析工作区状态
    const needsAnalysis = this.needsWorkspaceAnalysis();
    if (needsAnalysis) {
      return {
        task: this.createTask(TaskType.ANALYZE, TaskPriority.HIGH, {
          description: "分析工作区状态，识别可优化的地方",
          expectedOutcome: "获得工作区当前状态报告和优化建议列表",
        }),
        reasoning: `目标: "${goal}" - 需要先了解当前状态才能制定有效的行动计划`,
        confidence: 0.85,
      };
    }

    // 检查是否有待执行的任务
    const pendingTasks = this.context.activeTasks.filter(
      (t) => t.status === TaskStatus.PENDING,
    );

    if (pendingTasks.length > 0) {
      // 按优先级排序
      pendingTasks.sort((a, b) => {
        const priorityOrder = {
          [TaskPriority.CRITICAL]: 0,
          [TaskPriority.HIGH]: 1,
          [TaskPriority.MEDIUM]: 2,
          [TaskPriority.LOW]: 3,
        };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      const nextTask = pendingTasks[0];
      return {
        task: nextTask,
        reasoning: `继续执行待处理任务: ${nextTask.description}`,
        confidence: 0.9,
      };
    }

    return null;
  }

  /**
   * 规划维护任务
   */
  private planMaintenanceTask(): PlanningResult {
    return {
      task: this.createTask(TaskType.MAINTAIN, TaskPriority.LOW, {
        description: "执行例行维护：检查状态、清理临时数据、更新指标",
        expectedOutcome: "系统状态健康，无阻塞问题",
      }),
      reasoning: "没有紧急任务，执行例行维护以确保长期稳定性",
      confidence: 0.7,
    };
  }

  /**
   * 检查是否需要工作区分析
   */
  private needsWorkspaceAnalysis(): boolean {
    // 如果最近没有分析过，则需要分析
    const lastAnalysis = this.context.activeTasks.find(
      (t) =>
        t.type === TaskType.ANALYZE && t.description.includes("分析工作区"),
    );

    if (!lastAnalysis) {
      return true;
    }

    // 如果上次分析超过 10 分钟，重新分析
    const tenMinutes = 10 * 60 * 1000;
    return Date.now() - lastAnalysis.updatedAt > tenMinutes;
  }

  /**
   * 生成错误恢复行动
   */
  private generateRecoveryAction(error: string): string {
    // 根据错误类型生成相应的恢复行动
    if (error.includes("timeout") || error.includes("超时")) {
      return "增加超时时间或采用重试机制";
    }
    if (error.includes("memory") || error.includes("内存")) {
      return "清理缓存或压缩上下文";
    }
    if (error.includes("permission") || error.includes("权限")) {
      return "检查并调整权限设置";
    }
    if (error.includes("network") || error.includes("网络")) {
      return "使用本地缓存或重试请求";
    }
    return "记录错误并调整策略避免重复";
  }

  /**
   * 创建任务
   */
  private createTask(
    type: TaskType,
    priority: TaskPriority,
    options: {
      description: string;
      expectedOutcome?: string;
      dependencies?: string[];
      maxRetries?: number;
    },
  ): AutonomousTask {
    const now = Date.now();
    return {
      id: `task-${now}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      priority,
      description: options.description,
      expectedOutcome: options.expectedOutcome,
      status: TaskStatus.PENDING,
      dependencies: options.dependencies || [],
      createdAt: now,
      updatedAt: now,
      failureCount: 0,
      maxRetries: options.maxRetries || 3,
      executionHistory: [],
    };
  }

  /**
   * 标记任务完成
   */
  markTaskCompleted(taskId: string, result: TaskExecution): void {
    const task = this.context.activeTasks.find((t) => t.id === taskId);
    if (task) {
      task.status = TaskStatus.COMPLETED;
      task.updatedAt = Date.now();
      task.executionHistory.push(result);

      if (result.success) {
        this.context.completedTasks.push(taskId);
      }
    }
  }

  /**
   * 标记任务失败
   */
  markTaskFailed(taskId: string, error: string): void {
    const task = this.context.activeTasks.find((t) => t.id === taskId);
    if (task) {
      task.failureCount++;
      task.updatedAt = Date.now();

      if (task.failureCount >= task.maxRetries) {
        task.status = TaskStatus.FAILED;
        task.executionHistory.push({
          timestamp: Date.now(),
          success: false,
          summary: "任务失败，已达到最大重试次数",
          error,
        });
      }
    }
  }

  /**
   * 获取规划上下文
   */
  getContext(): PlanningContext {
    return { ...this.context };
  }
}

/**
 * 创建规划器实例
 */
export function createPlanner(): AutonomousTaskPlanner {
  return new AutonomousTaskPlanner();
}
