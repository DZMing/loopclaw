/**
 * 🦞 龙虾熔断器 (Circuit Breaker)
 *
 * 防止级联故障，保护外部服务调用
 * 状态: CLOSED (关闭/正常) → OPEN (开启/熔断) → HALF_OPEN (半开/试探)
 *
 * @see {@link https://martinfowler.com/bliki/CircuitBreaker.html}
 */

/**
 * 熔断器状态
 */
export enum CircuitState {
  /** 关闭状态 - 正常工作 */
  CLOSED = "CLOSED",
  /** 开启状态 - 熔断中 */
  OPEN = "OPEN",
  /** 半开状态 - 探测恢复 */
  HALF_OPEN = "HALF_OPEN",
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  /** 失败阈值 - 达到此值后熔断 */
  failureThreshold: number;
  /** 成功阈值 - 半开状态需要多少次成功才恢复 */
  successThreshold: number;
  /** 熔断超时 - 熔断后多久尝试恢复 (毫秒) */
  timeout: number;
  /** 滑动窗口大小 - 统计最近 N 次调用 */
  slidingWindowSize: number;
  /** 指数退避最大延迟 (毫秒) */
  maxBackoff: number;
  /** 指数退避抖动因子 (0-1) */
  backoffJitter: number;
}

/**
 * 默认配置
 */
const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 1 分钟
  slidingWindowSize: 100,
  maxBackoff: 60000, // 最大 1 分钟
  backoffJitter: 0.25, // ±25% 抖动
};

/**
 * 调用结果
 */
interface CallResult {
  success: boolean;
  timestamp: number;
}

/**
 * 熔断器统计
 */
export interface CircuitBreakerStats {
  /** 熔断器状态 */
  state: CircuitState;
  /** 总调用次数 */
  totalCalls: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  failureCount: number;
  /** 当前连续失败次数 */
  consecutiveFailures: number;
  /** 当前连续成功次数 */
  consecutiveSuccesses: number;
  /** 最后失败时间 */
  lastFailureTime: number | null;
  /** 下次半开尝试时间 */
  nextHalfOpenTime: number | null;
  /** 失败率 (0-1) */
  failureRate: number;
}

/**
 * 熔断器
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private stats: CircuitBreakerStats = {
    state: CircuitState.CLOSED,
    totalCalls: 0,
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    lastFailureTime: null,
    nextHalfOpenTime: null,
    failureRate: 0,
  };
  private slidingWindow: CallResult[] = [];
  private config: CircuitBreakerConfig;
  private name: string;

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
    this.stats.state = CircuitState.CLOSED;
  }

  /**
   * 执行调用（带熔断保护）
   */
  async execute<T>(fn: () => Promise<T> | T): Promise<T> {
    // 检查熔断器状态
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        throw new Error(`熔断器 ${this.name} 开启 - 服务暂时不可用`);
      }
    }

    const startTime = Date.now();
    this.stats.totalCalls++;

    try {
      const result = await fn();

      // 记录成功
      this.recordSuccess();

      return result;
    } catch (error) {
      // 记录失败
      this.recordFailure();

      // 检查是否需要熔断
      if (this.shouldTrip()) {
        this.transitionToOpen();
      }

      throw error;
    } finally {
      // 更新滑动窗口
      const elapsed = Date.now() - startTime;
      this.updateSlidingWindow(true, elapsed);
    }
  }

  /**
   * 记录成功
   */
  private recordSuccess(): void {
    this.stats.successCount++;
    this.stats.consecutiveSuccesses++;
    this.stats.consecutiveFailures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.stats.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * 记录失败
   */
  private recordFailure(): void {
    this.stats.failureCount++;
    this.stats.consecutiveFailures++;
    this.stats.consecutiveSuccesses = 0;
    this.stats.lastFailureTime = Date.now();
  }

  /**
   * 检查是否应该熔断
   */
  private shouldTrip(): boolean {
    // 基于连续失败数
    if (this.stats.consecutiveFailures >= this.config.failureThreshold) {
      return true;
    }

    // 基于滑动窗口失败率
    const recentFailures = this.slidingWindow.filter((r) => !r.success).length;
    const failureRate = recentFailures / this.slidingWindow.length;

    if (failureRate >= 0.5 && this.slidingWindow.length >= 10) {
      return true;
    }

    return false;
  }

  /**
   * 检查是否应该尝试重置
   */
  private shouldAttemptReset(): boolean {
    if (!this.stats.nextHalfOpenTime) {
      return false;
    }

    return Date.now() >= this.stats.nextHalfOpenTime;
  }

  /**
   * 更新滑动窗口
   */
  private updateSlidingWindow(success: boolean, elapsed: number): void {
    this.slidingWindow.push({
      success,
      timestamp: Date.now(),
    });

    // 限制窗口大小
    if (this.slidingWindow.length > this.config.slidingWindowSize) {
      this.slidingWindow.shift();
    }

    // 更新失败率
    const failures = this.slidingWindow.filter((r) => !r.success).length;
    this.stats.failureRate = failures / this.slidingWindow.length;
  }

  /**
   * 计算下次尝试时间（带抖动）
   */
  private calculateNextAttemptTime(): number {
    const now = Date.now();
    const baseDelay = this.config.timeout;

    // 添加抖动 (±25%)
    const jitter =
      baseDelay * this.config.backoffJitter * (2 * Math.random() - 1);

    return now + baseDelay + jitter;
  }

  /**
   * 转换到开启状态
   */
  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.stats.state = CircuitState.OPEN;
    this.stats.nextHalfOpenTime = this.calculateNextAttemptTime();
    console.warn(
      `🦞 熔断器 ${this.name} 开启 - ${this.stats.consecutiveFailures} 次连续失败`,
    );
  }

  /**
   * 转换到半开状态
   */
  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.stats.state = CircuitState.HALF_OPEN;
    this.stats.consecutiveSuccesses = 0;
    console.log(`🦞 熔断器 ${this.name} 半开 - 探测服务恢复`);
  }

  /**
   * 转换到关闭状态
   */
  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.stats.state = CircuitState.CLOSED;
    this.stats.consecutiveFailures = 0;
    this.stats.nextHalfOpenTime = null;
    console.log(`🦞 熔断器 ${this.name} 关闭 - 服务已恢复`);
  }

  /**
   * 手动重置
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.stats = {
      state: CircuitState.CLOSED,
      totalCalls: 0,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastFailureTime: null,
      nextHalfOpenTime: null,
      failureRate: 0,
    };
    this.slidingWindow = [];
  }

  /**
   * 获取统计信息
   */
  getStats(): CircuitBreakerStats {
    return { ...this.stats };
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * 是否允许通过请求
   */
  allowRequest(): boolean {
    if (this.state === CircuitState.OPEN) {
      return this.shouldAttemptReset();
    }
    return true;
  }
}

/**
 * 熔断器管理器
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * 获取或创建熔断器
   */
  getBreaker(
    name: string,
    config?: Partial<CircuitBreakerConfig>,
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  /**
   * 移除熔断器
   */
  removeBreaker(name: string): void {
    this.breakers.delete(name);
  }

  /**
   * 获取所有熔断器状态
   */
  getAllStats(): Map<string, CircuitBreakerStats> {
    const stats = new Map<string, CircuitBreakerStats>();
    for (const [name, breaker] of this.breakers) {
      stats.set(name, breaker.getStats());
    }
    return stats;
  }

  /**
   * 重置所有熔断器
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

/**
 * 全局熔断器管理器
 */
let globalCircuitBreakerManager: CircuitBreakerManager | null = null;

/**
 * 获取全局熔断器管理器
 */
export function getGlobalCircuitBreakerManager(): CircuitBreakerManager {
  if (!globalCircuitBreakerManager) {
    globalCircuitBreakerManager = new CircuitBreakerManager();
  }
  return globalCircuitBreakerManager;
}
