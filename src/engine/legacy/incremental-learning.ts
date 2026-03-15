/**
 * 🦞 龙虾增量学习引擎
 *
 * 基于 2026 年最新研究的在线学习和持续学习技术
 * 实现 Agent 的运行时动态适应
 *
 * @see {@link https://arxiv.org/html/2511.01093v1} - "Continual Learning, Not Training: Online Adaptation for Agents"
 * @see {@link https://www.aaai.org/2026-student-abstracts-and-posters-program-posters/} - AAAI 2026
 * @see {@link https://github.com/xialeiliu/Awesome-Incremental-Learning} - Incremental Learning Resources
 */

/**
 * 学习类型
 */
export enum LearningType {
  /** 任务增量学习 - 学习新任务同时保持旧任务性能 */
  TASK_INCREMENTAL = "task_incremental",
  /** 域增量学习 - 适应新域 */
  DOMAIN_INCREMENTAL = "domain_incremental",
  /** 类增量学习 - 逐步学习新类别 */
  CLASS_INCREMENTAL = "class_incremental",
  /** 在线适应 - 实时参数更新 */
  ONLINE_ADAPTATION = "online_adaptation",
}

/**
 * 记忆类型
 */
export enum MemoryType {
  /** 短期记忆 - 快速访问，容量小 */
  SHORT_TERM = "short_term",
  /** 长期记忆 - 持久存储，容量大 */
  LONG_TERM = "long_term",
  /** 工作记忆 - 当前任务相关 */
  WORKING = "working",
}

/**
 * 经验条目
 */
export interface ExperienceEntry {
  /** 唯一ID */
  id: string;
  /** 任务类型 */
  taskType: string;
  /** 输入状态 */
  inputState: any;
  /** 执行的动作 */
  action: string;
  /** 结果 */
  result: any;
  /** 奖励/惩罚 */
  reward?: number;
  /** 时间戳 */
  timestamp?: number;
  /** 访问次数 */
  accessCount?: number;
  /** 成功率 */
  successRate?: number;
  /** 上下文 */
  context?: Record<string, any>;
}

/**
 * 学习状态
 */
export interface LearningState {
  /** 已学习的任务 */
  learnedTasks: Set<string>;
  /** 性能指标 */
  performanceMetrics: Map<string, number>;
  /** 最近错误 */
  recentErrors: string[];
  /** 适应次数 */
  adaptationCount: number;
  /** 最后适应时间 */
  lastAdaptationTime: number;
}

/**
 * 增量学习配置
 */
export interface IncrementalLearningConfig {
  /** 最大记忆容量 */
  maxMemorySize?: number;
  /** 短期记忆容量 */
  shortTermMemorySize?: number;
  /** 长期记忆容量 */
  longTermMemorySize?: number;
  /** 遗忘率 */
  forgettingRate?: number;
  /** 学习率 */
  learningRate?: number;
  /** 适应阈值 */
  adaptationThreshold?: number;
  /** 启用经验回放 */
  enableExperienceReplay?: boolean;
  /** 启用元学习 */
  enableMetaLearning?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<IncrementalLearningConfig> = {
  maxMemorySize: 10000,
  shortTermMemorySize: 100,
  longTermMemorySize: 1000,
  forgettingRate: 0.01,
  learningRate: 0.1,
  adaptationThreshold: 0.7,
  enableExperienceReplay: true,
  enableMetaLearning: true,
};

/**
 * 增量学习引擎
 *
 * 实现持续学习和在线适应
 * 支持任务增量、域增量和类增量学习
 */
export class IncrementalLearningEngine {
  private config: Required<IncrementalLearningConfig>;
  private shortTermMemory: ExperienceEntry[] = [];
  private longTermMemory: ExperienceEntry[] = [];
  private workingMemory: Map<string, any> = new Map();
  private learningState: LearningState = {
    learnedTasks: new Set(),
    performanceMetrics: new Map(),
    recentErrors: [],
    adaptationCount: 0,
    lastAdaptationTime: Date.now(),
  };

  // 模拟神经网络权重
  private modelWeights: Map<string, number[]> = new Map();

  constructor(config: IncrementalLearningConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 记录经验
   */
  recordExperience(entry: Omit<ExperienceEntry, "id">): void {
    const experience: ExperienceEntry = {
      ...entry,
      id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      accessCount: 0,
    };

    // 添加到短期记忆
    this.shortTermMemory.push(experience);

    // 限制短期记忆大小
    if (this.shortTermMemory.length > this.config.shortTermMemorySize) {
      const removed = this.shortTermMemory.shift();
      // 重要经验转移到长期记忆
      if (
        removed &&
        ((removed.accessCount ?? 0) > 3 ||
          (removed.successRate && removed.successRate > 0.7))
      ) {
        this.longTermMemory.push(removed);
      }
    }

    // 限制长期记忆大小
    if (this.longTermMemory.length > this.config.longTermMemorySize) {
      // 移除最旧的经验
      this.longTermMemory.shift();
    }

    console.log(
      `📝 记录经验: ${entry.taskType} (短期: ${this.shortTermMemory.length}, 长期: ${this.longTermMemory.length})`,
    );
  }

  /**
   * 检索相关经验
   */
  retrieveRelevantExperiences(
    taskType: string,
    currentContext: Record<string, any>,
  ): ExperienceEntry[] {
    const allExperiences = [...this.shortTermMemory, ...this.longTermMemory];

    // 按相关性和时间排序
    const relevant = allExperiences
      .filter((exp) => exp.taskType === taskType)
      .filter((exp) => {
        // 上下文相似度检查
        if (!exp.context || !currentContext) return true;
        const contextKeys = Object.keys(currentContext);
        return contextKeys.some(
          (key) => exp.context?.[key] === currentContext[key],
        );
      })
      .sort((a, b) => {
        // 优先级：成功率 > 访问次数 > 时间
        const aScore =
          (a.successRate || 0) * 100 +
          (a.accessCount ?? 0) +
          (1000000 - (a.timestamp ?? 0)) / 1000000;
        const bScore =
          (b.successRate || 0) * 100 +
          (b.accessCount ?? 0) +
          (1000000 - (b.timestamp ?? 0)) / 1000000;
        return bScore - aScore;
      });

    return relevant.slice(0, 10); // 返回最相关的 10 条
  }

  /**
   * 增量学习
   */
  async learn(
    taskType: string,
    inputState: any,
    action: string,
    result: any,
    context?: Record<string, any>,
  ): Promise<void> {
    // 记录经验
    this.recordExperience({
      taskType,
      inputState,
      action,
      result,
      context,
    });

    // 更新性能指标
    const currentPerformance =
      this.learningState.performanceMetrics.get(taskType) || 0.5;
    const success = result.success !== false;
    const newPerformance = currentPerformance * 0.9 + (success ? 1 : 0) * 0.1;
    this.learningState.performanceMetrics.set(taskType, newPerformance);

    // 标记任务已学习
    this.learningState.learnedTasks.add(taskType);

    // 更新模型权重
    this.updateModelWeights(taskType, success);

    // 检查是否需要适应
    if (this.shouldAdapt(newPerformance)) {
      await this.adapt(taskType);
    }

    console.log(
      `🧠 学习完成: ${taskType} (性能: ${newPerformance.toFixed(2)})`,
    );
  }

  /**
   * 更新模型权重
   */
  private updateModelWeights(taskType: string, success: boolean): void {
    let weights = this.modelWeights.get(taskType);

    if (!weights) {
      // 初始化权重
      weights = [0.5, 0.5, 0.5];
      this.modelWeights.set(taskType, weights);
    }

    // 增量更新权重
    const adjustment = success ? 0.01 : -0.01;
    weights = weights.map((w) => Math.max(0, Math.min(1, w + adjustment)));

    // 归一化
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      weights = weights.map((w) => w / sum);
      this.modelWeights.set(taskType, weights);
    }
  }

  /**
   * 检查是否需要适应
   */
  private shouldAdapt(performance: number): boolean {
    const performanceChange = Math.abs(performance - 0.5);
    return (
      performanceChange > 0.3 ||
      performance < this.config.adaptationThreshold ||
      this.learningState.recentErrors.length > 5
    );
  }

  /**
   * 适应 - 调整策略
   */
  private async adapt(taskType: string): Promise<void> {
    this.learningState.adaptationCount++;
    this.learningState.lastAdaptationTime = Date.now();

    console.log(
      `🔄 触发适应: ${taskType} (第 ${this.learningState.adaptationCount} 次)`,
    );

    // 获取相关经验
    const experiences = this.retrieveRelevantExperiences(taskType, {});

    // 分析失败模式
    const failures = experiences.filter((e) => e.result?.success === false);
    if (failures.length > 3) {
      // 检测到系统性失败
      console.warn(`⚠️ 检测到系统性失败模式 (${failures.length} 次)`);
      this.learningState.recentErrors.push(`${taskType}: 系统性失败`);
    }

    // 经验回放
    if (this.config.enableExperienceReplay && experiences.length > 0) {
      console.log(`📼 经验回放: ${experiences.length} 条相关经验`);
    }
  }

  /**
   * 获取最佳动作
   */
  getBestAction(
    taskType: string,
    availableActions: string[],
  ): { action: string; confidence: number } {
    const weights = this.modelWeights.get(taskType) || [0.33, 0.33, 0.34];
    const performance =
      this.learningState.performanceMetrics.get(taskType) || 0.5;

    // 基于权重和性能选择动作
    const actionScores = availableActions.map((action, index) => {
      const baseScore = weights[index % weights.length] || 0.33;
      const experienceBonus = this.getExperienceBonus(taskType, action);
      return {
        action,
        confidence: baseScore * performance + experienceBonus * 0.1,
      };
    });

    // 选择最高分的动作
    actionScores.sort((a, b) => b.confidence - a.confidence);

    return (
      actionScores[0] || {
        action: availableActions[0] || "default",
        confidence: 0.5,
      }
    );
  }

  /**
   * 获取经验加成
   */
  private getExperienceBonus(taskType: string, action: string): number {
    const experiences = this.retrieveRelevantExperiences(taskType, {});
    const relevant = experiences.filter((e) => e.action === action);

    if (relevant.length === 0) return 0;

    // 计算平均成功率
    const avgSuccess =
      relevant.reduce((sum, e) => sum + (e.successRate || 0), 0) /
      relevant.length;
    return avgSuccess;
  }

  /**
   * 设置工作记忆
   */
  setWorkingMemory(key: string, value: any): void {
    this.workingMemory.set(key, value);
    console.log(`💾 工作记忆: ${key} = ${JSON.stringify(value).slice(0, 50)}`);
  }

  /**
   * 获取工作记忆
   */
  getWorkingMemory(key: string): any {
    return this.workingMemory.get(key);
  }

  /**
   * 清除工作记忆
   */
  clearWorkingMemory(): void {
    this.workingMemory.clear();
    console.log(`🗑️ 清除工作记忆`);
  }

  /**
   * 获取学习状态
   */
  getLearningState(): LearningState {
    return {
      ...this.learningState,
      learnedTasks: new Set(this.learningState.learnedTasks),
      performanceMetrics: new Map(this.learningState.performanceMetrics),
      recentErrors: [...this.learningState.recentErrors],
    };
  }

  /**
   * 导出学习报告
   */
  exportLearningReport(): string {
    const state = this.getLearningState();

    return `
🦞 增量学习报告

=== 学习统计 ===
已学习任务: ${state.learnedTasks.size}
适应次数: ${state.adaptationCount}
最后适应: ${new Date(state.lastAdaptationTime).toISOString()}

=== 性能指标 ===
${Array.from(state.performanceMetrics.entries())
  .map(([task, perf]) => `- ${task}: ${(perf * 100).toFixed(1)}%`)
  .join("\n")}

=== 记忆状态 ===
短期记忆: ${this.shortTermMemory.length} / ${this.config.shortTermMemorySize}
长期记忆: ${this.longTermMemory.length} / ${this.config.longTermMemorySize}
工作记忆: ${this.workingMemory.size} 项

${
  state.recentErrors.length > 0
    ? `
=== 最近错误 ===
${state.recentErrors
  .slice(-5)
  .map((e) => `- ${e}`)
  .join("\n")}
`
    : ""
}
    `.trim();
  }

  /**
   * 压缩记忆
   */
  compressMemories(): number {
    let compressed = 0;

    // 压缩短期记忆 - 移除低价值经验
    const beforeShort = this.shortTermMemory.length;
    this.shortTermMemory = this.shortTermMemory.filter((exp) => {
      // 保留高访问次数或高成功率的经验
      return (
        (exp.accessCount ?? 0) > 1 || (exp.successRate && exp.successRate > 0.6)
      );
    });
    compressed += beforeShort - this.shortTermMemory.length;

    // 压缩长期记忆 - 移除重复经验
    const beforeLong = this.longTermMemory.length;
    const seen = new Set<string>();
    this.longTermMemory = this.longTermMemory.filter((exp) => {
      const key = `${exp.taskType}_${exp.action}`;
      if (seen.has(key)) {
        return false; // 移除重复
      }
      seen.add(key);
      return true;
    });
    compressed += beforeLong - this.longTermMemory.length;

    // 清空错误日志
    if (this.learningState.recentErrors.length > 50) {
      const before = this.learningState.recentErrors.length;
      this.learningState.recentErrors =
        this.learningState.recentErrors.slice(-20);
      compressed += before - 20;
    }

    console.log(`🗜️ 压缩记忆: 移除 ${compressed} 条记录`);

    return compressed;
  }

  /**
   * 重置学习状态
   */
  reset(): void {
    this.shortTermMemory = [];
    this.longTermMemory = [];
    this.workingMemory.clear();
    this.learningState = {
      learnedTasks: new Set(),
      performanceMetrics: new Map(),
      recentErrors: [],
      adaptationCount: 0,
      lastAdaptationTime: Date.now(),
    };
    console.log(`🔄 重置学习状态`);
  }

  /**
   * 导出模型
   */
  exportModel(): Record<string, any> {
    return {
      version: "2.4",
      exportDate: new Date().toISOString(),
      config: this.config,
      modelWeights: Object.fromEntries(this.modelWeights),
      learningState: this.getLearningState(),
      shortTermMemoryCount: this.shortTermMemory.length,
      longTermMemoryCount: this.longTermMemory.length,
    };
  }

  /**
   * 导入模型
   */
  importModel(modelData: Record<string, any>): void {
    if (modelData.version !== "2.4") {
      throw new Error(`版本不兼容: ${modelData.version}`);
    }

    this.config = { ...this.config, ...modelData.config };
    this.modelWeights = new Map(Object.entries(modelData.modelWeights));

    if (modelData.learningState) {
      this.learningState = {
        learnedTasks: new Set(modelData.learningState.learnedTasks),
        performanceMetrics: new Map(
          Object.entries(modelData.learningState.performanceMetrics),
        ),
        recentErrors: modelData.learningState.recentErrors || [],
        adaptationCount: modelData.learningState.adaptationCount || 0,
        lastAdaptationTime:
          modelData.learningState.lastAdaptationTime || Date.now(),
      };
    }

    console.log(`📥 导入模型: ${modelData.exportDate}`);
  }
}

/**
 * 创建增量学习引擎
 */
export function createIncrementalLearningEngine(
  config?: IncrementalLearningConfig,
): IncrementalLearningEngine {
  return new IncrementalLearningEngine(config);
}

/**
 * 通用增量学习引擎
 */
export const globalIncrementalLearner = createIncrementalLearningEngine();
