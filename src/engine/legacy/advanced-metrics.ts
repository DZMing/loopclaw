/**
 * 🦞 龙虾高级指标系统
 *
 * 扩展事件循环监控，添加 P95 延迟、内存使用、背压检测
 * 基于 2026 Node.js 性能优化最佳实践
 *
 * @see {@link https://medium.com/@hadiyolworld007/node-js-performance-tuning-in-2026-event-loop-lag-fetch-backpressure-and-the-metrics-that-dff27b319415}
 */

import { PerformanceObserver } from "perf_hooks";
import type { EventLoopMetrics } from "./zero-latency-loop.js";

/**
 * 高级事件循环指标
 */
export interface AdvancedEventLoopMetrics extends EventLoopMetrics {
  /** P50 延迟 (中位数) */
  p50Lag: number;
  /** P95 延迟 */
  p95Lag: number;
  /** P99 延迟 */
  p99Lag: number;
  /** 最小延迟 */
  minLag: number;
  /** 总延迟和 (用于计算平均值) */
  totalLag: number;
  /** 内存使用 (字节) */
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  /** 背压等级 (0-10) */
  backpressureLevel: number;
  /** CPU 使用率 (0-1) */
  cpuUsage: number;
  /** 健康状态 */
  healthStatus: "healthy" | "degraded" | "unhealthy";
}

/**
 * 阈值配置
 */
export interface ThresholdConfig {
  /** P95 延迟警告阈值 (毫秒) */
  p95LagWarning: number;
  /** P95 延迟危险阈值 (毫秒) */
  p95LagCritical: number;
  /** 内存使用警告阈值 (字节) */
  memoryWarning: number;
  /** 内存使用危险阈值 (字节) */
  memoryCritical: number;
  /** 背压警告阈值 (队列长度) */
  backpressureWarning: number;
  /** 背压危险阈值 (队列长度) */
  backpressureCritical: number;
}

/**
 * 默认阈值
 */
const DEFAULT_THRESHOLDS: ThresholdConfig = {
  p95LagWarning: 50,
  p95LagCritical: 100,
  memoryWarning: 512 * 1024 * 1024, // 512 MB
  memoryCritical: 1024 * 1024 * 1024, // 1 GB
  backpressureWarning: 100,
  backpressureCritical: 500,
};

/**
 * 延迟样本
 */
interface LatencySample {
  timestamp: number;
  lag: number;
}

/**
 * 高级指标收集器
 */
export class AdvancedMetricsCollector {
  private samples: LatencySample[] = [];
  private maxSamples = 1000; // 保留最近 1000 个样本
  private config: ThresholdConfig;
  private lastCpuUsage: NodeJS.CpuUsage;
  private startTime: number;

  // 观察者
  private perfObserver!: PerformanceObserver;

  // 回调
  private _updateCallback?: (metrics: AdvancedEventLoopMetrics) => void;

  constructor(config?: Partial<ThresholdConfig>) {
    this.config = { ...DEFAULT_THRESHOLDS, ...config };
    this.lastCpuUsage = process.cpuUsage();
    this.startTime = Date.now();
    this.setupPerformanceObserver();
  }

  /**
   * 设置性能观察者
   */
  private setupPerformanceObserver(): void {
    this.perfObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        if (entry.entryType === "measure") {
          this.addSample(entry.duration as number);
        }
      }
    });
    this.perfObserver.observe({ entryTypes: ["measure"] });
  }

  /**
   * 添加延迟样本
   */
  addSample(lag: number): void {
    const sample: LatencySample = {
      timestamp: Date.now(),
      lag,
    };

    this.samples.push(sample);

    // 限制样本数量
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    // 触发更新
    if (this.samples.length % 10 === 0) {
      this.notifyUpdate();
    }
  }

  /**
   * 计算百分位数
   */
  private calculatePercentile(p: number): number {
    if (this.samples.length === 0) {
      return 0;
    }

    const sorted = this.samples.map((s) => s.lag).sort((a, b) => a - b);

    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * 获取内存使用情况
   */
  private getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
    };
  }

  /**
   * 获取 CPU 使用率
   */
  private getCpuUsage(): number {
    const currentUsage = process.cpuUsage();
    const elapsed = Date.now() - this.startTime;

    const userDiff = currentUsage.user - this.lastCpuUsage.user;
    const systemDiff = currentUsage.system - this.lastCpuUsage.system;

    this.lastCpuUsage = currentUsage;

    // CPU 使用率 = (user + system) / (elapsed * 1000) (单位转换)
    return Math.min(1, (userDiff + systemDiff) / (elapsed * 1000));
  }

  /**
   * 计算背压等级
   */
  private calculateBackpressure(): number {
    // 简化实现：基于事件循环延迟
    const p95Lag = this.calculatePercentile(95);

    if (p95Lag < this.config.p95LagWarning) {
      return Math.min(10, (p95Lag / this.config.p95LagWarning) * 3);
    } else if (p95Lag < this.config.p95LagCritical) {
      return (
        3 +
        ((p95Lag - this.config.p95LagWarning) /
          (this.config.p95LagCritical - this.config.p95LagWarning)) *
          4
      );
    } else {
      return (
        7 +
        Math.min(
          3,
          (p95Lag - this.config.p95LagCritical) / this.config.p95LagCritical,
        )
      );
    }
  }

  /**
   * 计算健康状态
   */
  private calculateHealthStatus(
    metrics: AdvancedEventLoopMetrics,
  ): "healthy" | "degraded" | "unhealthy" {
    const { p95Lag, memoryUsage, backpressureLevel } = metrics;

    // 检查危险条件
    if (
      p95Lag >= this.config.p95LagCritical ||
      memoryUsage.heapUsed >= this.config.memoryCritical ||
      backpressureLevel >= 8
    ) {
      return "unhealthy";
    }

    // 检查警告条件
    if (
      p95Lag >= this.config.p95LagWarning ||
      memoryUsage.heapUsed >= this.config.memoryWarning ||
      backpressureLevel >= 5
    ) {
      return "degraded";
    }

    return "healthy";
  }

  /**
   * 获取当前指标
   */
  getMetrics(): AdvancedEventLoopMetrics {
    const lags = this.samples.map((s) => s.lag);
    const memoryUsage = this.getMemoryUsage();
    const cpuUsage = this.getCpuUsage();
    const backpressureLevel = this.calculateBackpressure();

    const metrics: AdvancedEventLoopMetrics = {
      // 基础指标
      avgLag:
        lags.length > 0 ? lags.reduce((a, b) => a + b, 0) / lags.length : 0,
      maxLag: lags.length > 0 ? Math.max(...lags) : 0,
      highLagCount: lags.filter((l) => l >= this.config.p95LagWarning).length,
      sampleCount: lags.length,

      // 高级指标
      p50Lag: this.calculatePercentile(50),
      p95Lag: this.calculatePercentile(95),
      p99Lag: this.calculatePercentile(99),
      minLag: lags.length > 0 ? Math.min(...lags) : 0,
      totalLag: lags.reduce((a, b) => a + b, 0),

      // 系统指标
      memoryUsage,
      cpuUsage,
      backpressureLevel,

      // 健康状态 - 使用专用方法计算
      healthStatus: "healthy",
    };

    // 动态计算健康状态
    metrics.healthStatus = this.calculateHealthStatus(metrics);

    return metrics;
  }

  /**
   * 获取完整指标（包含健康状态）
   */
  getFullMetrics(): AdvancedEventLoopMetrics {
    const lags = this.samples.map((s) => s.lag);
    const memoryUsage = this.getMemoryUsage();
    const cpuUsage = this.getCpuUsage();
    const backpressureLevel = this.calculateBackpressure();

    const baseMetrics = {
      // 基础指标
      avgLag:
        lags.length > 0 ? lags.reduce((a, b) => a + b, 0) / lags.length : 0,
      maxLag: lags.length > 0 ? Math.max(...lags) : 0,
      highLagCount: lags.filter((l) => l >= this.config.p95LagWarning).length,
      sampleCount: lags.length,

      // 高级指标
      p50Lag: this.calculatePercentile(50),
      p95Lag: this.calculatePercentile(95),
      p99Lag: this.calculatePercentile(99),
      minLag: lags.length > 0 ? Math.min(...lags) : 0,
      totalLag: lags.reduce((a, b) => a + b, 0),

      // 系统指标
      memoryUsage,
      cpuUsage,
      backpressureLevel,

      // 健康状态 - 使用专用方法计算
      healthStatus: this.calculateHealthStatus({
        // 基础指标
        avgLag:
          lags.length > 0 ? lags.reduce((a, b) => a + b, 0) / lags.length : 0,
        maxLag: lags.length > 0 ? Math.max(...lags) : 0,
        highLagCount: lags.filter((l) => l >= this.config.p95LagWarning).length,
        sampleCount: lags.length,
        // 高级指标
        p50Lag: this.calculatePercentile(50),
        p95Lag: this.calculatePercentile(95),
        p99Lag: this.calculatePercentile(99),
        minLag: lags.length > 0 ? Math.min(...lags) : 0,
        totalLag: lags.reduce((a, b) => a + b, 0),
        // 系统指标
        memoryUsage,
        cpuUsage,
        backpressureLevel,
        // 健康状态（临时占位，会被覆盖）
        healthStatus: "healthy",
      }),
    };

    return baseMetrics;
  }

  /**
   * 设置更新回调
   */
  setUpdateCallback(
    callback: (metrics: AdvancedEventLoopMetrics) => void,
  ): void {
    this._updateCallback = callback;
  }

  /**
   * 通知更新
   */
  private notifyUpdate(): void {
    if (this._updateCallback) {
      const metrics = this.getFullMetrics();
      this._updateCallback(metrics);
    }
  }

  /**
   * 重置指标
   */
  reset(): void {
    this.samples = [];
    this.startTime = Date.now();
    this.lastCpuUsage = process.cpuUsage();
  }

  /**
   * 关闭观察者
   */
  shutdown(): void {
    if (this.perfObserver) {
      this.perfObserver.disconnect();
    }
  }
}

/**
 * 创建高级指标收集器
 */
export function createAdvancedMetricsCollector(
  config?: Partial<ThresholdConfig>,
): AdvancedMetricsCollector {
  return new AdvancedMetricsCollector(config);
}
