/**
 * 🦞 龙虾零延迟循环引擎
 *
 * 基于 event loop 零阻塞原则的永动循环实现。
 * 核心目标：while(isRunning) 零延迟，无 sleep/heartbeat
 *
 * 性能优化技术：
 * - setImmediate 让出控制权（不阻塞事件循环）
 * - Microtask batching（批量处理微任务）
 * - Event loop monitoring（监控事件循环延迟）
 *
 * @see {@link https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop}
 */

/**
 * 事件循环延迟统计
 */
export interface EventLoopMetrics {
  /** 平均延迟（毫秒） */
  avgLag: number;
  /** 最大延迟 */
  maxLag: number;
  /** 延迟次数超过阈值的次数 */
  highLagCount: number;
  /** 总测量次数 */
  sampleCount: number;
}

/**
 * 零延迟循环选项
 */
export interface ZeroLatencyLoopOptions {
  /** 每次循环后是否让出控制权 */
  yieldAfterEachLoop?: boolean;
  /** 事件循环延迟阈值（毫秒） */
  lagThreshold?: number;
  /** 性能监控回调 */
  onMetricsUpdate?: (metrics: EventLoopMetrics) => void;
}

/**
 * 默认选项
 */
const DEFAULT_LOOP_OPTIONS: ZeroLatencyLoopOptions = {
  yieldAfterEachLoop: true,
  lagThreshold: 50, // 50ms
  onMetricsUpdate: undefined,
};

/**
 * 零延迟永动循环引擎
 *
 * 实现真正的 while(isRunning) 零延迟循环
 */
export class ZeroLatencyLoopEngine {
  private isRunning = false;
  private loopCount = 0;
  private options: ZeroLatencyLoopOptions;

  // 事件循环监控
  private lastLoopTime = 0;
  private metrics: EventLoopMetrics = {
    avgLag: 0,
    maxLag: 0,
    highLagCount: 0,
    sampleCount: 0,
  };

  constructor(options: Partial<ZeroLatencyLoopOptions> = {}) {
    this.options = { ...DEFAULT_LOOP_OPTIONS, ...options };
  }

  /**
   * 启动零延迟永动循环
   *
   * @param loopBody 循环体函数，返回 true 继续运行，false 停止
   */
  async start(loopBody: () => Promise<boolean> | boolean): Promise<void> {
    this.isRunning = true;
    this.loopCount = 0;
    this.lastLoopTime = Date.now();

    while (this.isRunning) {
      let shouldContinue = true;
      try {
        // 执行循环体
        shouldContinue = await loopBody();

        if (!shouldContinue) {
          this.stop();
          break;
        }

        // 更新事件循环监控
        this.updateMetrics();
      } catch (error) {
        // 狂暴异常处理：错误转化为提示词
        console.error("🦞 循环异常:", error);
        // 继续运行，不终止
      }

      // 循环计数器必须在 try-catch 外，确保异常时也能递增
      this.loopCount++;

      // 零延迟：立即下一轮，或使用 setImmediate 让出控制权
      if (this.options.yieldAfterEachLoop) {
        await this.yieldToEventLoop();
      }
    }
  }

  /**
   * 停止循环
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * 检查是否运行中
   */
  running(): boolean {
    return this.isRunning;
  }

  /**
   * 获取循环次数
   */
  getLoopCount(): number {
    return this.loopCount;
  }

  /**
   * 获取事件循环指标
   */
  getMetrics(): EventLoopMetrics {
    return { ...this.metrics };
  }

  /**
   * 让出控制权到事件循环
   *
   * 使用 setImmediate 而非 setTimeout/setInterval，实现真正的零延迟让出
   */
  private async yieldToEventLoop(): Promise<void> {
    await new Promise<void>((resolve) => {
      setImmediate(() => resolve());
    });
  }

  /**
   * 更新事件循环指标
   */
  private updateMetrics(): void {
    const now = Date.now();
    const loopTime = now - this.lastLoopTime;
    this.lastLoopTime = now;

    // 计算延迟（实际间隔 - 理想间隔 0）
    const lag = Math.max(0, loopTime);

    this.metrics.sampleCount++;

    // 更新平均延迟（移动平均）
    const alpha = 0.1; // 平滑因子
    this.metrics.avgLag = this.metrics.avgLag * (1 - alpha) + lag * alpha;

    // 更新最大延迟
    if (lag > this.metrics.maxLag) {
      this.metrics.maxLag = lag;
    }

    // 计数高延迟次数
    const threshold = this.options.lagThreshold || 50;
    if (lag > threshold) {
      this.metrics.highLagCount++;
    }

    // 回调通知
    if (this.metrics.sampleCount % 100 === 0 && this.options.onMetricsUpdate) {
      this.options.onMetricsUpdate(this.getMetrics());
    }
  }

  /**
   * 重置指标
   */
  resetMetrics(): void {
    this.metrics = {
      avgLag: 0,
      maxLag: 0,
      highLagCount: 0,
      sampleCount: 0,
    };
    this.lastLoopTime = Date.now();
  }
}

/**
 * 创建零延迟循环引擎
 */
export function createZeroLatencyLoop(
  options?: Partial<ZeroLatencyLoopOptions>,
): ZeroLatencyLoopEngine {
  return new ZeroLatencyLoopEngine(options);
}

/**
 * 批量处理微任务
 *
 * 将多个微任务批量处理，减少调度开销
 */
export class MicrotaskBatcher {
  private tasks: Array<() => void> = [];
  private scheduled = false;
  private errorCallback?: (error: unknown, task: () => void) => void;

  constructor(options?: {
    errorCallback?: (error: unknown, task: () => void) => void;
  }) {
    this.errorCallback = options?.errorCallback;
  }

  /**
   * 添加任务到批次
   */
  add(task: () => void): void {
    this.tasks.push(task);

    if (!this.scheduled) {
      this.scheduled = true;
      Promise.resolve().then(() => this.flush());
    }
  }

  /**
   * 执行所有任务
   */
  private flush(): void {
    this.scheduled = false;
    const tasksToRun = this.tasks.splice(0);

    for (const task of tasksToRun) {
      try {
        task();
      } catch (error) {
        if (this.errorCallback) {
          this.errorCallback(error, task);
        } else {
          console.error("Microtask error:", error);
        }
      }
    }
  }

  /**
   * 获取待处理任务数
   */
  get pendingCount(): number {
    return this.tasks.length;
  }
}

/**
 * 创建微任务批处理器
 */
export function createMicrotaskBatcher(options?: {
  errorCallback?: (error: unknown, task: () => void) => void;
}): MicrotaskBatcher {
  return new MicrotaskBatcher(options);
}

/**
 * 非阻塞执行器
 *
 * 将同步任务包装为异步，避免阻塞事件循环
 */
export class NonBlockingExecutor {
  private batcher: MicrotaskBatcher;

  constructor() {
    this.batcher = createMicrotaskBatcher();
  }

  /**
   * 执行任务（非阻塞）
   */
  execute<T>(task: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      this.batcher.add(() => {
        try {
          resolve(task());
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * 批量执行多个任务
   */
  async executeAll<T>(tasks: Array<() => T>): Promise<T[]> {
    const promises = tasks.map((task) => this.execute(task));
    return Promise.all(promises);
  }
}
