/**
 * 💰 成本监控系统
 *
 * 跟踪 Token 使用、API 调用次数、执行时间
 * 达到预算时自动停止，避免意外费用
 *
 * @version 2.40.0
 * @since 2025-03-11
 */

// ========== 类型定义 ==========

/**
 * 成本类型
 */
export enum CostType {
  /** Token 消耗 */
  TOKEN = "token",
  /** API 调用 */
  API_CALL = "api_call",
  /** 执行时间（毫秒） */
  EXECUTION_TIME = "execution_time",
  /** 计算资源 */
  COMPUTE = "compute",
}

/**
 * 成本记录
 */
export interface CostRecord {
  /** 类型 */
  type: CostType;
  /** 数量 */
  amount: number;
  /** 单位 */
  unit: string;
  /** 时间戳 */
  timestamp: number;
  /** 来源（如：OpenAI、Anthropic） */
  source?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 成本预算配置
 */
export interface CostBudgetConfig {
  /** 最大 Token 数 */
  maxTokens?: number;
  /** 最大 API 调用次数 */
  maxApiCalls?: number;
  /** 最大执行时间（毫秒） */
  maxExecutionTime?: number;
  /** Token 预算警告阈值（0-1） */
  tokenWarningThreshold: number;
  /** 成本单价（每1000 tokens） */
  costPer1kTokens: number;
}

/** 默认预算配置 */
export const DEFAULT_BUDGET_CONFIG: CostBudgetConfig = {
  tokenWarningThreshold: 0.8, // 80% 时警告
  costPer1kTokens: 0.01, // $0.01 per 1k tokens
  maxExecutionTime: 3600000, // 1小时
};

/**
 * 成本统计
 */
export interface CostStatistics {
  /** 总 Token 数 */
  totalTokens: number;
  /** 总 API 调用数 */
  totalApiCalls: number;
  /** 总执行时间（毫秒） */
  totalExecutionTime: number;
  /** 估算成本 */
  estimatedCost: number;
  /** 各类型统计 */
  byType: Record<CostType, number>;
  /** 各来源统计 */
  bySource: Record<string, number>;
}

/**
 * 预算状态
 */
export enum BudgetStatus {
  /** 正常 */
  OK = "ok",
  /** 警告 */
  WARNING = "warning",
  /** 已超支 */
  EXCEEDED = "exceeded",
  /** 已耗尽 */
  DEPLETED = "depleted",
}

// ========== 成本监控器 ==========

/**
 * 成本监控器
 */
export class CostMonitor {
  private config: CostBudgetConfig;
  private records: CostRecord[] = [];
  private startTime: number;
  private stopRequested = false;
  private onBudgetExceeded?: (stats: CostStatistics) => void;
  private onBudgetWarning?: (stats: CostStatistics) => void;

  constructor(config?: Partial<CostBudgetConfig>) {
    this.config = { ...DEFAULT_BUDGET_CONFIG, ...config };
    this.startTime = Date.now();
  }

  /**
   * 记录成本
   */
  record(
    type: CostType,
    amount: number,
    source?: string,
    metadata?: Record<string, unknown>,
  ): void {
    if (this.stopRequested) {
      throw new Error("CostMonitor 已停止，拒绝记录新的成本");
    }

    const record: CostRecord = {
      type,
      amount,
      unit:
        type === CostType.EXECUTION_TIME
          ? "ms"
          : type === CostType.TOKEN
            ? "tokens"
            : "count",
      timestamp: Date.now(),
      source,
      metadata,
    };

    this.records.push(record);

    // 检查预算状态
    this.checkBudget();
  }

  /**
   * 记录 Token 使用
   */
  recordTokens(tokens: number, source?: string): void {
    this.record(CostType.TOKEN, tokens, source);
  }

  /**
   * 记录 API 调用
   */
  recordApiCall(source?: string): void {
    this.record(CostType.API_CALL, 1, source);
  }

  /**
   * 获取统计数据
   */
  getStatistics(): CostStatistics {
    const stats: CostStatistics = {
      totalTokens: 0,
      totalApiCalls: 0,
      totalExecutionTime: Date.now() - this.startTime,
      estimatedCost: 0,
      byType: {
        [CostType.TOKEN]: 0,
        [CostType.API_CALL]: 0,
        [CostType.EXECUTION_TIME]: 0,
        [CostType.COMPUTE]: 0,
      },
      bySource: {},
    };

    for (const record of this.records) {
      stats.byType[record.type] += record.amount;

      if (record.type === CostType.TOKEN) {
        stats.totalTokens += record.amount;
        stats.estimatedCost +=
          (record.amount / 1000) * this.config.costPer1kTokens;
      } else if (record.type === CostType.API_CALL) {
        stats.totalApiCalls += record.amount;
      } else if (record.type === CostType.EXECUTION_TIME) {
        stats.totalExecutionTime += record.amount;
      }

      if (record.source) {
        stats.bySource[record.source] =
          (stats.bySource[record.source] || 0) + record.amount;
      }
    }

    return stats;
  }

  /**
   * 获取预算状态
   */
  getBudgetStatus(): BudgetStatus {
    const stats = this.getStatistics();

    // 检查是否超支
    if (this.config.maxTokens && stats.totalTokens >= this.config.maxTokens) {
      return BudgetStatus.DEPLETED;
    }
    if (
      this.config.maxApiCalls &&
      stats.totalApiCalls >= this.config.maxApiCalls
    ) {
      return BudgetStatus.DEPLETED;
    }
    if (
      this.config.maxExecutionTime &&
      stats.totalExecutionTime >= this.config.maxExecutionTime
    ) {
      return BudgetStatus.DEPLETED;
    }

    // 检查是否警告
    if (
      this.config.maxTokens &&
      stats.totalTokens >=
        this.config.maxTokens * this.config.tokenWarningThreshold
    ) {
      return BudgetStatus.WARNING;
    }

    return BudgetStatus.OK;
  }

  /**
   * 检查预算（内部方法）
   */
  private checkBudget(): void {
    const status = this.getBudgetStatus();
    const stats = this.getStatistics();

    if (status === BudgetStatus.DEPLETED || status === BudgetStatus.EXCEEDED) {
      this.stopRequested = true;
      if (this.onBudgetExceeded) {
        this.onBudgetExceeded(stats);
      }
      throw new Error(`预算已耗尽: ${JSON.stringify(stats)}`);
    } else if (status === BudgetStatus.WARNING && this.onBudgetWarning) {
      this.onBudgetWarning(stats);
    }
  }

  /**
   * 设置预算超支回调
   */
  onExceeded(callback: (stats: CostStatistics) => void): void {
    this.onBudgetExceeded = callback;
  }

  /**
   * 设置预算警告回调
   */
  onWarning(callback: (stats: CostStatistics) => void): void {
    this.onBudgetWarning = callback;
  }

  /**
   * 请求停止（拒绝新记录）
   */
  requestStop(): void {
    this.stopRequested = true;
  }

  /**
   * 重置监控
   */
  reset(): void {
    this.records = [];
    this.startTime = Date.now();
    this.stopRequested = false;
  }

  /**
   * 导出报告
   */
  exportReport(): string {
    const stats = this.getStatistics();
    const status = this.getBudgetStatus();

    return `
📊 成本监控报告
===============
状态: ${status}
总 Token: ${stats.totalTokens.toLocaleString()}
总 API 调用: ${stats.totalApiCalls.toLocaleString()}
执行时间: ${Math.floor(stats.totalExecutionTime / 1000)}秒
估算成本: $${stats.estimatedCost.toFixed(4)}

按类型:
  Token: ${stats.byType[CostType.TOKEN].toLocaleString()}
  API 调用: ${stats.byType[CostType.API_CALL].toLocaleString()}
  执行时间: ${stats.byType[CostType.EXECUTION_TIME].toLocaleString()}ms

按来源:
${Object.entries(stats.bySource)
  .map(([source, amount]) => `  ${source}: ${amount.toLocaleString()}`)
  .join("\n")}
    `.trim();
  }
}

// ========== 工厂函数 ==========

/**
 * 创建成本监控器
 */
export function createCostMonitor(
  config?: Partial<CostBudgetConfig>,
): CostMonitor {
  return new CostMonitor(config);
}
