/**
 * 🦞 龙虾重试管理器
 *
 * 智能重试机制，支持指数退避、抖动和熔断集成
 * 基于 2026 云原生最佳实践
 *
 * @see {@link https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter.html}
 */

import type { CircuitBreaker } from "./circuit-breaker.js";

/**
 * 重试策略
 */
export enum RetryStrategy {
  /** 固定延迟 */
  FIXED = "FIXED",
  /** 线性退避 */
  LINEAR = "LINEAR",
  /** 指数退避 */
  EXPONENTIAL = "EXPONENTIAL",
  /** 指数退避带抖动 */
  EXPONENTIAL_WITH_JITTER = "EXPONENTIAL_WITH_JITTER",
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始延迟 (毫秒) */
  initialDelay: number;
  /** 最大延迟 (毫秒) */
  maxDelay: number;
  /** 重试策略 */
  strategy: RetryStrategy;
  /** 抖动因子 (0-1) */
  jitterFactor: number;
  /** 倍数 (指数退避) */
  multiplier: number;
}

/**
 * 默认重试配置
 */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  strategy: RetryStrategy.EXPONENTIAL_WITH_JITTER,
  jitterFactor: 0.25, // ±25% 抖动
  multiplier: 2,
};

/**
 * 重试结果
 */
export interface RetryResult<T> {
  /** 是否成功 */
  success: boolean;
  /** 结果值（成功时） */
  value?: T;
  /** 错误信息（失败时） */
  error?: Error;
  /** 尝试次数 */
  attempts: number;
  /** 总耗时 (毫秒) */
  totalDuration: number;
}

/**
 * 重试管理器
 */
export class RetryManager {
  private config: Required<RetryConfig>;

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * 执行带重试的函数
   */
  async execute<T>(
    fn: () => Promise<T> | T,
    options?: Partial<RetryConfig>,
  ): Promise<RetryResult<T>> {
    const mergedConfig = { ...this.config, ...options };
    const startTime = Date.now();

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
      try {
        const value = await fn();

        return {
          success: true,
          value,
          attempts: attempt + 1,
          totalDuration: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error as Error;

        // 最后一次尝试不再等待
        if (attempt >= mergedConfig.maxRetries) {
          break;
        }

        // 计算延迟
        const delay = this.calculateDelay(attempt, mergedConfig);

        console.log(
          `🦞 重试 ${attempt + 1}/${mergedConfig.maxRetries}，延迟 ${delay}ms: ${(lastError as Error).message}`,
        );

        // 等待后重试
        await this.delay(delay);
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: this.config.maxRetries + 1,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * 计算重试延迟
   */
  private calculateDelay(
    attempt: number,
    config: Required<RetryConfig>,
  ): number {
    let delay: number;

    switch (config.strategy) {
      case RetryStrategy.FIXED:
        delay = config.initialDelay;
        break;

      case RetryStrategy.LINEAR:
        delay = config.initialDelay + attempt * config.initialDelay;
        break;

      case RetryStrategy.EXPONENTIAL:
        delay = config.initialDelay * Math.pow(config.multiplier, attempt);
        break;

      case RetryStrategy.EXPONENTIAL_WITH_JITTER:
        delay = config.initialDelay * Math.pow(config.multiplier, attempt);

        // 添加抖动
        const jitter = delay * config.jitterFactor * (2 * Math.random() - 1);
        delay += jitter;
        break;

      default:
        delay = config.initialDelay;
    }

    // 限制在最大延迟内
    return Math.min(delay, config.maxDelay);
  }

  /**
   * 延迟函数
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 执行带熔断的重试
   */
  async executeWithCircuitBreaker<T>(
    circuitBreaker: CircuitBreaker,
    fn: () => Promise<T> | T,
  ): Promise<RetryResult<T>> {
    return this.execute(async () => {
      return circuitBreaker.execute(fn);
    });
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * 创建重试管理器
 */
export function createRetryManager(
  config?: Partial<RetryConfig>,
): RetryManager {
  return new RetryManager(config);
}

/**
 * 装饰器：为函数添加重试能力
 */
export function withRetry<T extends (...args: any[]) => any>(
  fn: T,
  config?: Partial<RetryConfig>,
): T {
  const retryManager = new RetryManager(config);

  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const result = await retryManager.execute(async () => fn(...args));

    if (!result.success) {
      throw result.error!;
    }

    return result.value as ReturnType<T>;
  }) as T;
}
