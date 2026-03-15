/**
 * Circuit Breaker 状态
 */
export enum CircuitBreakerState {
  /** 正常状态，允许请求通过 */
  CLOSED = "closed",
  /** 开路状态，拒绝请求 */
  OPEN = "open",
  /** 半开状态，允许少量请求测试 */
  HALF_OPEN = "half_open",
}

/**
 * Circuit Breaker 配置
 */
export interface CircuitBreakerConfig {
  /** 触发熔断的失败阈值 */
  failureThreshold: number;
  /** 熔断持续时间 */
  resetTimeoutMs: number;
  /** 半开状态允许的测试请求数 */
  halfOpenMaxCalls: number;
}

/**
 * 默认 Circuit Breaker 配置
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 1 分钟
  halfOpenMaxCalls: 3,
};

/**
 * Circuit Breaker 状态机
 *
 * 防止级联故障，当服务频繁失败时暂时停止调用。
 * 基于 [Martin Fowler 的 Circuit Breaker 模式](https://martinfowler.com/bliki/CircuitBreaker.html)
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenSuccessCount = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * 执行带熔断保护的操作
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 检查是否应该拒绝请求
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        // 转到半开状态，测试服务是否恢复
        this.state = CircuitBreakerState.HALF_OPEN;
        this.halfOpenSuccessCount = 0;
      } else {
        throw new Error("Circuit Breaker: 服务暂时不可用（熔断中）");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * 处理成功
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenSuccessCount++;

      // 半开状态下，连续成功则恢复正常
      if (this.halfOpenSuccessCount >= this.config.halfOpenMaxCalls) {
        this.state = CircuitBreakerState.CLOSED;
      }
    }
  }

  /**
   * 处理失败
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // 失败次数达到阈值，触发熔断
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
    }
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * 重置熔断器
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenSuccessCount = 0;
  }
}
