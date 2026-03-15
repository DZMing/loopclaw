/**
 * 循环引擎模块
 *
 * 负责核心循环执行、健康检查和性能监控。
 *
 * @version 2.48.0
 * @since 2026-03-13
 * @author Claude Code
 */

import type { OpenClawPluginServiceContext } from "../../types.js";
import type { EngineConfig } from "../../config.js";

/** 类型导入 */
import type { EngineLogger } from "./runtime-context.js";

/**
 * 行动类型常量
 * @internal
 */
const ActionType = {
  /** 初始化行动 */
  INIT: "init",
  /** 错误恢复行动 */
  ERROR_RECOVERY: "error_recovery",
  /** 执行具体行动 */
  EXECUTE: "execute",
} as const;

/**
 * 行动关键词常量
 * @internal
 */
const ActionKeywords = {
  /** 分析关键词 */
  ANALYZE: "分析",
  /** 检查关键词 */
  CHECK: "检查",
  /** 生成关键词 */
  GENERATE: "生成",
  /** 代码关键词 */
  CODE: "代码",
} as const;

/**
 * 优化建议列表
 * @internal
 */
const OPTIMIZATION_SUGGESTIONS = [
  "考虑使用 TypeScript 严格模式提高代码质量",
  "定期更新依赖包以获取安全补丁",
  "为公共 API 编写 JSDoc 文档",
  "使用环境变量管理敏感配置",
  "添加单元测试覆盖核心功能",
] as const;

/**
 * 默认维护行动列表
 * @internal
 */
const DEFAULT_MAINTENANCE_ACTIONS = [
  "分析工作区文件结构",
  "检查代码质量",
  "生成优化建议",
  "验证配置完整性",
  "更新运行状态",
] as const;

/** 最大连续错误数 - 超过后触发电路熔断 */
export const MAX_CONSECUTIVE_ERRORS = 10;
/** 基础退避时间（毫秒） */
export const BASE_BACKOFF_MS = 1000;
/** 最大退避时间（毫秒） */
export const MAX_BACKOFF_MS = 60000;
/** 最小循环间隔（毫秒） - 防止失控循环 */
export const MIN_LOOP_INTERVAL_MS = 1000;
/** 最大日志文件大小（MB） */
export const MAX_LOG_SIZE_MB = 50;
/** 健康检查卡死阈值（秒） */
export const MAX_STALL_SECONDS = 300;

/**
 * 错误分类枚举
 */
export enum ErrorCategory {
  UNKNOWN = "unknown",
  FILE_IO = "file_io",
  PARSE = "parse",
  NETWORK = "network",
  PERMISSION = "permission",
  TIMEOUT = "timeout",
}

/**
 * 错误记录
 */
export interface ErrorRecord {
  loop: number;
  error: string;
  timestamp: number;
  category?: string;
  resolved?: boolean;
  recoveryAttemptedAt?: number;
}

/**
 * 上下文状态
 */
export interface ContextState {
  actions: Array<{
    loop: number;
    action: string;
    result: string;
    timestamp: number;
  }>;
  errors: ErrorRecord[];
}

/**
 * 性能指标
 */
export interface LoopMetrics {
  totalTime: number;
  minTime: number;
  maxTime: number;
  avgTime: number;
}

/**
 * 循环引擎状态
 */
interface LoopEngineState {
  isRunning: boolean;
  loopCount: number;
  loopStartTime: number;
  lastLoopTime: number;
  context: ContextState;
  loopMetrics: LoopMetrics;
}

/**
 * 安全调用 debug 日志
 * @param logger 日志记录器
 * @param message 日志消息
 * @internal
 */
function safeDebug(logger: EngineLogger, message: string): void {
  if (logger.debug) {
    logger.debug(message);
  }
}

/**
 * 循环引擎管理器
 *
 * 负责核心循环执行、健康检查和性能监控。
 *
 * @version 2.48.1
 * @since 2026-03-13
 * @author Runtime Reliability Engineer
 *
 * ## 可靠性改进 (v2.48.1)
 * - 错误回退: 连续错误时指数退避
 * - 电路熔断: 连续超过阈值自动停止
 * - 最小循环间隔: 防止亚毫秒级失控循环
 * - 主动健康检查: 卡死时自动停止引擎
 */
export class LoopEngineManager {
  private state: LoopEngineState = {
    isRunning: false,
    loopCount: 0,
    loopStartTime: 0,
    lastLoopTime: 0,
    context: { actions: [], errors: [] },
    loopMetrics: { totalTime: 0, minTime: Infinity, maxTime: 0, avgTime: 0 },
  };

  private abortController: AbortController | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private serviceContext: OpenClawPluginServiceContext | undefined = undefined;

  /** 连续错误计数器 */
  private consecutiveErrors = 0;

  constructor(
    private readonly api: { logger: EngineLogger },
    private readonly config: EngineConfig,
    private readonly dependencies: {
      loadMissionFiles: (
        ctx: OpenClawPluginServiceContext,
      ) => Promise<{ mission: string; boundaries: string }>;
      planNextAction: (
        mission: string,
        context: ContextState,
      ) => Promise<{
        description: string;
        type: string;
        recoveryErrorTimestamp?: number;
      }>;
      executeAction: (
        action: {
          description: string;
          type: string;
          recoveryErrorTimestamp?: number;
        },
        ctx: OpenClawPluginServiceContext,
      ) => Promise<{ summary: string }>;
      persistState: (ctx: OpenClawPluginServiceContext) => Promise<void>;
      compressContext: () => void;
      cleanExpiredCache: () => void;
    },
  ) {}

  /**
   * 检查引擎是否正在运行
   */
  isRunning(): boolean {
    return this.state.isRunning;
  }

  /**
   * 获取循环计数
   */
  getLoopCount(): number {
    return this.state.loopCount;
  }

  /**
   * 设置循环计数
   */
  setLoopCount(value: number): void {
    this.state.loopCount = value;
  }

  /**
   * 获取上下文
   */
  getContext(): ContextState {
    return this.state.context;
  }

  /**
   * 设置上下文
   */
  setContext(context: ContextState): void {
    this.state.context = context;
  }

  /**
   * 获取平均循环时间
   */
  getAvgLoopTime(): number {
    return this.state.loopMetrics.avgTime;
  }

  /**
   * 获取循环速率（每秒循环次数）
   */
  getLoopsPerSecond(): number {
    if (this.state.loopMetrics.avgTime === 0) return 0;
    return Math.round((1000 / this.state.loopMetrics.avgTime) * 100) / 100;
  }

  /**
   * 获取上下文大小
   */
  getContextSize(): number {
    return JSON.stringify(this.state.context).length;
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const err of this.state.context.errors) {
      const category = err.category || ErrorCategory.UNKNOWN;
      stats[category] = (stats[category] || 0) + 1;
    }
    return stats;
  }

  /**
   * 启动循环
   */
  async startLoop(
    ctx: OpenClawPluginServiceContext,
    onLoopComplete?: () => void,
  ): Promise<void> {
    if (this.state.isRunning) {
      this.api.logger.warn("引擎已在运行中");
      return;
    }

    this.state.isRunning = true;
    this.abortController = new AbortController();
    this.state.lastLoopTime = Date.now();
    this.consecutiveErrors = 0;
    this.serviceContext = ctx;

    this.startHealthCheck(ctx);

    // 启动异步循环
    this.runLoop(ctx, this.abortController.signal)
      .catch((error) => {
        this.api.logger.error(
          "循环异常: " +
            (error instanceof Error ? error.message : String(error)),
        );
      })
      .finally(() => {
        this.state.isRunning = false;
        this.abortController = null;
        this.stopHealthCheck();
        onLoopComplete?.();
      });

    this.api.logger.info("🦞 永动循环已启动（后台运行）");
  }

  /**
   * 停止循环
   */
  async stopLoop(ctx?: OpenClawPluginServiceContext): Promise<void> {
    this.state.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
    }
    this.stopHealthCheck();

    if (ctx && this.dependencies.persistState) {
      await this.dependencies.persistState(ctx).catch((error) => {
        this.api.logger.warn(
          `停止时状态持久化失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }

    this.api.logger.info("🛑 永动循环已停止");
  }

  /**
   * 核心循环执行
   */
  private async runLoop(
    ctx: OpenClawPluginServiceContext,
    signal: AbortSignal,
  ): Promise<void> {
    this.api.logger.info("🔄 永动循环开始");
    this.state.loopMetrics = {
      totalTime: 0,
      minTime: Infinity,
      maxTime: 0,
      avgTime: 0,
    };

    while (this.state.isRunning && !signal.aborted) {
      this.state.loopStartTime = Date.now();

      try {
        // 1. 加载 MISSION 和 BOUNDARIES
        const { mission } = await this.dependencies.loadMissionFiles(ctx);

        // 2. 生成下一步行动
        const action = await this.dependencies.planNextAction(
          mission,
          this.state.context,
        );

        // 3. 执行行动
        const result = await this.dependencies.executeAction(action, ctx);

        // 4. 更新状态
        this.state.context.actions.push({
          loop: this.state.loopCount,
          action: action.description,
          result: result.summary,
          timestamp: Date.now(),
        });

        // 5. 定期压缩上下文
        if (
          this.state.loopCount % this.config.compressInterval === 0 &&
          this.state.loopCount > 0
        ) {
          this.dependencies.compressContext();
        }

        // 6. 定期清理过期缓存
        if (
          this.state.loopCount % (this.config.compressInterval * 2) === 0 &&
          this.state.loopCount > 0
        ) {
          this.dependencies.cleanExpiredCache();
        }

        // 7. 定期持久化状态
        if (this.state.loopCount % this.config.persistInterval === 0) {
          await this.dependencies.persistState(ctx);
        }

        this.state.loopCount++;

        // 记录循环时间
        this.recordLoopTime();
        this.state.lastLoopTime = Date.now();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorCategory = this.categorizeError(errorMsg);

        this.consecutiveErrors++;

        this.api.logger.error(
          `❌ [循环 ${this.state.loopCount}] 异常: ${errorMsg} [${errorCategory}] (连续第 ${this.consecutiveErrors} 次)`,
        );

        this.state.context.errors.push({
          loop: this.state.loopCount,
          error: errorMsg,
          timestamp: Date.now(),
          category: errorCategory,
          resolved: false,
        });

        // 电路熔断: 连续错误超过阈值则自动停止
        if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          this.api.logger.error(
            `🛑 连续 ${this.consecutiveErrors} 次错误，引擎自动停止以防止失控循环`,
          );
          this.state.isRunning = false;
          this.recordLoopTime();
          break;
        }

        // 指数退避
        const backoff = Math.min(
          BASE_BACKOFF_MS * Math.pow(2, this.consecutiveErrors - 1),
          MAX_BACKOFF_MS,
        );
        this.api.logger.info(`⏳ 退避 ${backoff}ms 后重试...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));

        this.recordLoopTime();
        continue; // 跳过最小间隔检查（已在退避中等待）
      }

      // 成功执行，重置错误计数
      this.consecutiveErrors = 0;

      // 强制最小循环间隔，防止失控循环
      const loopElapsed = Date.now() - this.state.loopStartTime;
      const remaining = MIN_LOOP_INTERVAL_MS - loopElapsed;
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    }

    this.api.logger.info(
      `🔄 永动循环结束，总循环次数: ${this.state.loopCount}`,
    );
    this.logPerformanceMetrics();
  }

  /**
   * 记录循环时间
   */
  private recordLoopTime(): void {
    const elapsed = Date.now() - this.state.loopStartTime;

    this.state.loopMetrics.totalTime += elapsed;
    if (elapsed < this.state.loopMetrics.minTime) {
      this.state.loopMetrics.minTime = elapsed;
    }
    if (elapsed > this.state.loopMetrics.maxTime) {
      this.state.loopMetrics.maxTime = elapsed;
    }

    this.state.loopMetrics.avgTime =
      Math.round(
        (this.state.loopMetrics.totalTime / (this.state.loopCount + 1)) * 100,
      ) / 100;
  }

  /**
   * 记录性能指标
   */
  private logPerformanceMetrics(): void {
    const minTime =
      this.state.loopMetrics.minTime === Infinity
        ? 0
        : this.state.loopMetrics.minTime;
    this.api.logger.info(
      `📊 性能指标: 总计=${this.state.loopCount} 平均=${this.state.loopMetrics.avgTime}ms 最快=${minTime}ms 最慢=${this.state.loopMetrics.maxTime}ms 速率=${this.getLoopsPerSecond()}循环/秒`,
    );
  }

  /**
   * 分类错误
   */
  private categorizeError(errorMsg: string): ErrorCategory {
    const lower = errorMsg.toLowerCase();
    const rules = [
      {
        patterns: ["enoent", "eacces", "file"],
        category: ErrorCategory.FILE_IO,
      },
      { patterns: ["syntax", "parse", "json"], category: ErrorCategory.PARSE },
      {
        patterns: ["network", "fetch", "request"],
        category: ErrorCategory.NETWORK,
      },
      {
        patterns: ["permission", "unauthorized", "forbidden"],
        category: ErrorCategory.PERMISSION,
      },
      { patterns: ["timeout", "timed out"], category: ErrorCategory.TIMEOUT },
    ];

    for (const rule of rules) {
      for (const pattern of rule.patterns) {
        if (lower.includes(pattern)) {
          return rule.category;
        }
      }
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(ctx?: OpenClawPluginServiceContext): void {
    if (!this.config.enableHealthCheck) return;

    this.stopHealthCheck();

    const contextForStop = ctx ?? this.serviceContext;

    this.healthCheckInterval = setInterval(async () => {
      const timeSinceLastLoop = Date.now() - this.state.lastLoopTime;
      const stallSeconds = Math.round(timeSinceLastLoop / 1000);

      if (
        timeSinceLastLoop > this.config.stallThreshold &&
        this.state.isRunning
      ) {
        this.api.logger.warn(`⚠️ 循环已卡死 ${stallSeconds} 秒`);

        // 主动健康检查: 卡死超过阈值则自动停止
        if (stallSeconds >= MAX_STALL_SECONDS) {
          this.api.logger.error(
            `🛑 引擎卡死超过 ${MAX_STALL_SECONDS} 秒，自动停止`,
          );
          await this.stopLoop(contextForStop);
        }
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * 检查是否有最近的错误（5分钟内）
   */
  hasRecentErrors(): boolean {
    const errors = this.state.context.errors;
    if (errors.length === 0) return false;
    const lastError = errors[errors.length - 1];
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return lastError.timestamp > fiveMinutesAgo;
  }
}

/**
 * 导出常量供其他模块使用
 */
export const Constants = {
  ActionType,
  ActionKeywords,
  OPTIMIZATION_SUGGESTIONS,
  DEFAULT_MAINTENANCE_ACTIONS,
};
