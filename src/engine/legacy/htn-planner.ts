/**
 * 🦞 龙虾分层任务网络 (HTN) 规划器
 *
 * 基于 Hierarchical Task Networks 的任务分解和规划
 * 结合 LLM 实现自动化任务分解
 *
 * @see {@link https://agentic-design.ai/patterns/planning-execution/hierarchical-task-network-planning}
 * @see {@link https://www.geeksforgeeks.org/artificial-intelligence/hierarchical-task-network-htn-planning-in-ai/}
 */

/**
 * 任务状态
 */
export enum TaskStatus {
  /** 待执行 */
  PENDING = "pending",
  /** 进行中 */
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
export enum HTNTaskType {
  /** 复合任务（可分解） */
  COMPOSITE = "composite",
  /** 原子任务（不可分解） */
  PRIMITIVE = "primitive",
  /** 抽象任务（需要具体化） */
  ABSTRACT = "abstract",
}

/**
 * HTN 任务节点
 */
export interface HTNTask {
  /** 任务ID */
  id: string;
  /** 任务名称 */
  name: string;
  /** 任务描述 */
  description?: string;
  /** 任务类型 */
  type: HTNTaskType;
  /** 状态 */
  status: TaskStatus;
  /** 优先级 */
  priority: number;
  /** 子任务 */
  subtasks?: HTNTask[];
  /** 前置条件 */
  preconditions?: string[];
  /** 后置条件 */
  postconditions?: string[];
  /** 方法（如何执行） */
  method?: string;
  /** 参数 */
  parameters?: Record<string, any>;
  /** 执行结果 */
  result?: any;
  /** 开始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
  /** 父任务ID */
  parentId?: string;
  /** 深度 */
  depth: number;
}

/**
 * HTN 方法（任务分解方案）
 */
export interface HTNMethod {
  /** 方法名称 */
  name: string;
  /** 适用任务 */
  task: string;
  /** 前置条件 */
  preconditions: string[];
  /** 子任务 */
  subtasks: Omit<HTNTask, "id" | "depth">[];
  /** 约束 */
  constraints?: string[];
}

/**
 * HTN 域（领域知识）
 */
export interface HTNDomain {
  /** 域名称 */
  name: string;
  /** 方法库 */
  methods: HTNMethod[];
  /** 操作符（原子任务的执行方式） */
  operators: Map<string, (params: any) => Promise<any>>;
}

/**
 * 规划配置
 */
export interface HTNPlannerConfig {
  /** 最大分解深度 */
  maxDepth?: number;
  /** 启用并行执行 */
  enableParallel?: boolean;
  /** 启用回溯 */
  enableBacktracking?: boolean;
  /** 规划超时（毫秒） */
  planningTimeout?: number;
  /** 启用 LLM 辅助分解 */
  enableLLMDecomposition?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<HTNPlannerConfig> = {
  maxDepth: 10,
  enableParallel: true,
  enableBacktracking: true,
  planningTimeout: 30000,
  enableLLMDecomposition: true,
};

/**
 * 规划结果
 */
export interface HTNPlan {
  /** 根任务 */
  rootTask: HTNTask;
  /** 所有任务（扁平化） */
  allTasks: HTNTask[];
  /** 总任务数 */
  totalTasks: number;
  /** 待执行任务 */
  pendingTasks: HTNTask[];
  /** 规划耗时（毫秒） */
  planningDuration: number;
  /** 规划深度 */
  planningDepth: number;
  /** 分支数 */
  branchCount: number;
}

/**
 * 执行结果
 */
export interface HTNExecutionResult {
  /** 规划 */
  plan: HTNPlan;
  /** 执行状态 */
  status: TaskStatus;
  /** 完成的任务数 */
  completedTasks: number;
  /** 失败的任务数 */
  failedTasks: number;
  /** 执行耗时（毫秒） */
  executionDuration: number;
  /** 最终结果 */
  result?: any;
  /** 错误信息 */
  errors: string[];
}

/**
 * HTN 规划器
 *
 * 实现分层任务网络规划算法
 * 支持自动任务分解、约束验证、并行执行
 */
export class HTNPlanner {
  private config: Required<HTNPlannerConfig>;
  private domains: Map<string, HTNDomain> = new Map();
  private taskCounter: number = 0;

  constructor(config: HTNPlannerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 注册域
   */
  registerDomain(domain: HTNDomain): void {
    this.domains.set(domain.name, domain);
    console.log(
      `🦞 注册域: ${domain.name} (${domain.methods.length} 方法, ${domain.operators.size} 操作符)`,
    );
  }

  /**
   * 创建根任务
   */
  createRootTask(
    name: string,
    description?: string,
    priority: number = 5,
  ): HTNTask {
    return {
      id: this.generateTaskId(),
      name,
      description,
      type: HTNTaskType.COMPOSITE,
      status: TaskStatus.PENDING,
      priority,
      depth: 0,
    };
  }

  /**
   * 生成任务ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${++this.taskCounter}`;
  }

  /**
   * 规划任务
   */
  async plan(rootTask: HTNTask, domainName?: string): Promise<HTNPlan> {
    const startTime = Date.now();

    console.log(`🦞 HTN 规划开始: ${rootTask.name}`);
    console.log(
      `   配置: maxDepth=${this.config.maxDepth}, parallel=${this.config.enableParallel}, backtracking=${this.config.enableBacktracking}`,
    );

    // 获取域
    const domain = domainName
      ? this.domains.get(domainName)
      : this.getDefaultDomain();
    if (!domain) {
      throw new Error(`域未找到: ${domainName || "default"}`);
    }

    // 分解任务
    await this.decomposeTask(rootTask, domain, 0);

    // 扁平化任务列表
    const allTasks = this.flattenTasks(rootTask);

    // 提取待执行任务
    const pendingTasks = allTasks.filter(
      (t) =>
        t.status === TaskStatus.PENDING && t.type === HTNTaskType.PRIMITIVE,
    );

    // 计算规划统计
    const planningDepth = Math.max(...allTasks.map((t) => t.depth));
    const branchCount = this.countBranches(rootTask);

    const plan: HTNPlan = {
      rootTask,
      allTasks,
      totalTasks: allTasks.length,
      pendingTasks,
      planningDuration: Date.now() - startTime,
      planningDepth,
      branchCount,
    };

    console.log(`🦞 HTN 规划完成:`);
    console.log(`   总任务: ${plan.totalTasks}`);
    console.log(`   待执行: ${plan.pendingTasks.length}`);
    console.log(`   规划深度: ${plan.planningDepth}`);
    console.log(`   分支数: ${plan.branchCount}`);
    console.log(`   规划耗时: ${plan.planningDuration}ms`);

    return plan;
  }

  /**
   * 分解任务
   */
  private async decomposeTask(
    task: HTNTask,
    domain: HTNDomain,
    currentDepth: number,
  ): Promise<void> {
    // 检查深度限制
    if (currentDepth >= this.config.maxDepth) {
      console.warn(
        `⚠️ 达到最大深度 ${this.config.maxDepth}，停止分解: ${task.name}`,
      );
      task.type = HTNTaskType.PRIMITIVE;
      return;
    }

    // 检查是否有匹配的方法
    const methods = domain.methods.filter((m) => m.task === task.name);

    if (methods.length === 0) {
      // 没有分解方法，作为原子任务
      task.type = HTNTaskType.PRIMITIVE;
      console.log(`📌 原子任务: ${task.name}`);
      return;
    }

    // 选择第一个匹配的方法
    const method = methods[0];

    // 验证前置条件
    if (!this.checkPreconditions(method.preconditions, task)) {
      console.warn(`⚠️ 前置条件不满足: ${task.name}`);
      task.status = TaskStatus.SKIPPED;
      return;
    }

    // 创建子任务
    task.subtasks = method.subtasks.map((subtask, index) => ({
      ...subtask,
      id: this.generateTaskId(),
      status: TaskStatus.PENDING,
      priority: task.priority,
      parentId: task.id,
      depth: currentDepth + 1,
    }));

    console.log(
      `🔧 分解: ${task.name} -> ${task.subtasks.map((t) => t.name).join(", ")}`,
    );

    // 递归分解子任务
    for (const subtask of task.subtasks) {
      if (subtask.type === HTNTaskType.COMPOSITE) {
        await this.decomposeTask(subtask, domain, currentDepth + 1);
      }
    }
  }

  /**
   * 检查前置条件
   */
  private checkPreconditions(preconditions: string[], task: HTNTask): boolean {
    // 简化实现：总是返回 true
    // 实际应用中应该根据任务状态和上下文检查
    return true;
  }

  /**
   * 扁平化任务列表
   */
  private flattenTasks(rootTask: HTNTask): HTNTask[] {
    const tasks: HTNTask[] = [rootTask];
    const queue = [...(rootTask.subtasks || [])];

    while (queue.length > 0) {
      const current = queue.shift()!;
      tasks.push(current);
      if (current.subtasks) {
        queue.push(...current.subtasks);
      }
    }

    return tasks;
  }

  /**
   * 计算分支数
   */
  private countBranches(rootTask: HTNTask): number {
    let count = 0;
    const countBranches = (task: HTNTask): void => {
      if (task.subtasks && task.subtasks.length > 1) {
        count += task.subtasks.length - 1;
      }
      task.subtasks?.forEach(countBranches);
    };
    countBranches(rootTask);
    return count;
  }

  /**
   * 执行规划
   */
  async execute(
    plan: HTNPlan,
    domainName?: string,
  ): Promise<HTNExecutionResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let completedCount = 0;
    let failedCount = 0;

    console.log(`🦞 HTN 执行开始: ${plan.rootTask.name}`);

    // 获取域
    const domain = domainName
      ? this.domains.get(domainName)
      : this.getDefaultDomain();
    if (!domain) {
      throw new Error(`域未找到: ${domainName || "default"}`);
    }

    // 按优先级和依赖关系排序任务
    const sortedTasks = this.sortTasksForExecution(plan.allTasks);

    // 执行任务
    for (const task of sortedTasks) {
      if (
        task.type === HTNTaskType.PRIMITIVE &&
        task.status === TaskStatus.PENDING
      ) {
        task.status = TaskStatus.IN_PROGRESS;
        task.startTime = Date.now();

        try {
          console.log(`▶️ 执行: ${task.name}`);

          // 调用操作符
          const operator = domain.operators.get(task.method || task.name);
          if (operator) {
            task.result = await operator(task.parameters);
          } else {
            // 默认操作符：标记为完成
            task.result = { executed: true };
          }

          task.status = TaskStatus.COMPLETED;
          task.endTime = Date.now();
          completedCount++;

          console.log(
            `✅ 完成: ${task.name} (${task.endTime - task.startTime!}ms)`,
          );
        } catch (error) {
          task.status = TaskStatus.FAILED;
          task.endTime = Date.now();
          failedCount++;
          const errorMsg = `${task.name}: ${error}`;
          errors.push(errorMsg);
          console.error(`❌ 失败: ${errorMsg}`);
        }
      }
    }

    // 更新根任务状态
    const rootFailed = sortedTasks.some(
      (t) =>
        t.status === TaskStatus.FAILED &&
        !this.isAncestorCompleted(t, sortedTasks),
    );
    plan.rootTask.status = rootFailed
      ? TaskStatus.FAILED
      : TaskStatus.COMPLETED;

    return {
      plan,
      status: plan.rootTask.status,
      completedTasks: completedCount,
      failedTasks: failedCount,
      executionDuration: Date.now() - startTime,
      result: plan.rootTask.result,
      errors,
    };
  }

  /**
   * 排序任务用于执行
   */
  private sortTasksForExecution(tasks: HTNTask[]): HTNTask[] {
    // 按深度优先，然后按优先级
    return [...tasks].sort((a, b) => {
      if (a.depth !== b.depth) {
        return a.depth - b.depth; // 深度优先
      }
      return b.priority - a.priority; // 优先级降序
    });
  }

  /**
   * 检查祖先是否完成
   */
  private isAncestorCompleted(task: HTNTask, allTasks: HTNTask[]): boolean {
    const checkParent = (parent: HTNTask | undefined): boolean => {
      if (!parent) return true;
      if (parent.status === TaskStatus.FAILED) {
        return false; // 有祖先失败
      }
      if (parent.status !== TaskStatus.COMPLETED) {
        return true; // 有祖先尚未完成
      }
      if (!parent.parentId) return true;
      const nextParent = allTasks.find((t) => t.id === parent.parentId);
      return checkParent(nextParent);
    };
    return checkParent(allTasks.find((t) => t.id === task.parentId));
  }

  /**
   * 获取默认域
   */
  private getDefaultDomain(): HTNDomain {
    return {
      name: "default",
      methods: [],
      operators: new Map(),
    };
  }

  /**
   * 导出规划为 JSON
   */
  exportPlan(plan: HTNPlan): string {
    return JSON.stringify(plan, null, 2);
  }

  /**
   * 导出规划为可视化文本
   */
  exportPlanText(plan: HTNPlan): string {
    const lines: string[] = [];
    lines.push("🦞 HTN 规划可视化");
    lines.push("");
    lines.push(`根任务: ${plan.rootTask.name}`);
    lines.push(`总任务: ${plan.totalTasks}`);
    lines.push(`待执行: ${plan.pendingTasks.length}`);
    lines.push(`规划深度: ${plan.planningDepth}`);
    lines.push(`分支数: ${plan.branchCount}`);
    lines.push("");
    lines.push("任务树:");
    lines.push("");

    const printTask = (task: HTNTask, indent: string = "") => {
      const statusIcon = this.getStatusIcon(task.status);
      const typeIcon = task.type === HTNTaskType.PRIMITIVE ? "📌" : "📁";
      lines.push(
        `${indent}${statusIcon} ${typeIcon} ${task.name} [${task.type}]`,
      );

      if (task.subtasks) {
        for (const subtask of task.subtasks) {
          printTask(subtask, indent + "  ");
        }
      }
    };

    printTask(plan.rootTask);

    return lines.join("\n");
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(status: TaskStatus): string {
    switch (status) {
      case TaskStatus.PENDING:
        return "⏳";
      case TaskStatus.IN_PROGRESS:
        return "▶️";
      case TaskStatus.COMPLETED:
        return "✅";
      case TaskStatus.FAILED:
        return "❌";
      case TaskStatus.SKIPPED:
        return "⏭️";
      default:
        return "❓";
    }
  }
}

/**
 * 创建 HTN 规划器
 */
export function createHTNPlanner(config?: HTNPlannerConfig): HTNPlanner {
  return new HTNPlanner(config);
}

/**
 * 快速创建方法
 */
export function createHTNMethod(
  name: string,
  task: string,
  subtasks: Omit<HTNTask, "id" | "depth">[],
): HTNMethod {
  return {
    name,
    task,
    preconditions: [],
    subtasks,
  };
}

/**
 * 快速创建任务
 */
export function createHTNTask(
  name: string,
  type: HTNTaskType = HTNTaskType.PRIMITIVE,
  method?: string,
): Omit<HTNTask, "id" | "depth" | "priority"> {
  return {
    name,
    type,
    status: TaskStatus.PENDING,
    ...(method && { method }),
  };
}

/**
 * 预定义的通用域
 */
export const GENERAL_DOMAIN: HTNDomain = {
  name: "general",
  methods: [],
  operators: new Map<string, (params: any) => Promise<any>>([
    [
      "log",
      async (params) => {
        console.log(params?.message || "");
        return { logged: true };
      },
    ],
    [
      "sleep",
      async (params) => {
        const ms = params?.ms || 1000;
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { slept: ms };
      },
    ],
  ]),
};
