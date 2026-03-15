/**
 * 🦞 龙虾遥测系统
 *
 * 收集和导出性能指标、错误日志和系统状态
 * 支持多种导出格式：JSON、Prometheus、StatsD
 *
 * @see {@link https://medium.com/@hadiyolworld007/node-js-performance-tuning-in-2026-event-loop-lag-fetch-backpressure-and-the-metrics-that-dff27b319415}
 */

import { createWriteStream, existsSync, mkdirSync, WriteStream } from "fs";
import { join } from "path";

/**
 * 遥测指标
 */
export interface TelemetryMetrics {
  /** 时间戳 */
  timestamp: number;
  /** 事件循环指标 */
  eventLoop?: {
    avgLag: number;
    maxLag: number;
    p95Lag: number;
    healthStatus: string;
  };
  /** 系统资源 */
  system?: {
    cpuUsage: number;
    memoryUsage: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
    };
  };
  /** 调度器状态 */
  scheduler?: {
    queueLength: number;
    runningCount: number;
    loadLevel: string;
  };
  /** 熔断器状态 */
  circuitBreakers?: {
    [name: string]: {
      state: string;
      failureRate: number;
    };
  };
  /** 自定义标签 */
  tags?: Record<string, string>;
}

/**
 * 遥测配置
 */
export interface TelemetryConfig {
  /** 导出目录 */
  exportDir?: string;
  /** 启用文件输出 */
  enableFileOutput?: boolean;
  /** 启用控制台输出 */
  enableConsoleOutput?: boolean;
  /** 导出格式 */
  format: "json" | "prometheus" | "statsd";
  /** 采样率 (0-1) */
  sampleRate: number;
  /** 批量大小 */
  batchSize: number;
}

/**
 * 默认配置
 */
const DEFAULT_TELEMETRY_CONFIG: Required<Omit<TelemetryConfig, "format">> = {
  exportDir: "./telemetry",
  enableFileOutput: true,
  enableConsoleOutput: false,
  sampleRate: 1.0,
  batchSize: 100,
};

/**
 * 遥测收集器
 */
export class TelemetryCollector {
  private config: Required<Omit<TelemetryConfig, "format">> & {
    format: "json" | "prometheus" | "statsd";
  };
  private buffer: TelemetryMetrics[] = [];
  private outputFileStreams: Map<string, WriteStream> = new Map();
  private startTime: number;

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = {
      ...DEFAULT_TELEMETRY_CONFIG,
      format: config.format || "json",
    } as Required<Omit<TelemetryConfig, "format">> & {
      format: "json" | "prometheus" | "statsd";
    };
    this.startTime = Date.now();

    if (this.config.enableFileOutput) {
      this.setupFileOutput();
    }
  }

  /**
   * 设置文件输出
   */
  private setupFileOutput(): void {
    if (!existsSync(this.config.exportDir)) {
      mkdirSync(this.config.exportDir, { recursive: true });
    }

    const logPath = join(this.config.exportDir, "metrics.log");
    const stream = createWriteStream(logPath, { flags: "a" });

    this.outputFileStreams.set("metrics", stream);
    stream.on("error", (err) => console.error("遥测写入错误:", err));
  }

  /**
   * 记录指标
   */
  record(metrics: Partial<TelemetryMetrics>): void {
    // 采样
    if (Math.random() > this.config.sampleRate) {
      return;
    }

    const telemetryMetric: TelemetryMetrics = {
      timestamp: Date.now(),
      ...metrics,
    };

    this.buffer.push(telemetryMetric);

    // 批量写入
    if (this.buffer.length >= this.config.batchSize) {
      this.flush();
    }

    // 控制台输出
    if (this.config.enableConsoleOutput) {
      console.log("📊", JSON.stringify(telemetryMetric, null, 2));
    }
  }

  /**
   * 刷新缓冲区
   */
  flush(): void {
    if (this.buffer.length === 0) {
      return;
    }

    switch (this.config.format) {
      case "json":
        this.flushAsJSON();
        break;
      case "prometheus":
        this.flushAsPrometheus();
        break;
      case "statsd":
        this.flushAsStatsD();
        break;
    }

    this.buffer = [];
  }

  /**
   * 刷新为 JSON
   */
  private flushAsJSON(): void {
    const stream = this.outputFileStreams.get("metrics");
    if (!stream) {
      return;
    }

    for (const metric of this.buffer) {
      stream.write(JSON.stringify(metric) + "\n");
    }
  }

  /**
   * 刷新为 Prometheus 格式
   */
  private flushAsPrometheus(): void {
    const stream = this.outputFileStreams.get("prometheus");
    if (!stream) {
      return;
    }

    const prometheusData = this.convertToPrometheus(this.buffer);
    stream.write(prometheusData);
  }

  /**
   * 转换为 Prometheus 格式
   */
  private convertToPrometheus(metrics: TelemetryMetrics[]): string {
    const lines: string[] = [];

    for (const metric of metrics) {
      // 事件循环指标
      if (metric.eventLoop) {
        lines.push(
          `# HELP lobster_event_loop_lag Event loop lag in milliseconds`,
        );
        lines.push(`# TYPE lobster_event_loop_lag gauge`);
        lines.push(
          `lobster_event_loop_lag{quantile="avg"} ${metric.eventLoop.avgLag} ${metric.timestamp}`,
        );
        lines.push(
          `lobster_event_loop_lag{quantile="p95"} ${metric.eventLoop.p95Lag || 0} ${metric.timestamp}`,
        );
        lines.push(
          `lobster_event_loop_health_status{status="${metric.eventLoop.healthStatus}"} 1 ${metric.timestamp}`,
        );
      }

      // 系统指标
      if (metric.system) {
        lines.push(
          `lobster_system_cpu_usage ${metric.system.cpuUsage} ${metric.timestamp}`,
        );
        lines.push(
          `lobster_system_memory_usage ${metric.system.memoryUsage.heapUsed} ${metric.timestamp}`,
        );
      }

      // 调度器指标
      if (metric.scheduler) {
        lines.push(
          `lobster_scheduler_queue_length ${metric.scheduler.queueLength} ${metric.timestamp}`,
        );
        lines.push(
          `lobster_scheduler_running_tasks ${metric.scheduler.runningCount} ${metric.timestamp}`,
        );
        lines.push(
          `lobster_scheduler_load_level{level="${metric.scheduler.loadLevel}"} 1 ${metric.timestamp}`,
        );
      }
    }

    return lines.join("\n") + "\n\n";
  }

  /**
   * 刷新为 StatsD 格式
   */
  private flushAsStatsD(): void {
    const stream = this.outputFileStreams.get("statsd");
    if (!stream) {
      return;
    }

    const statsdData = this.convertToStatsD(this.buffer);
    stream.write(statsdData);
  }

  /**
   * 转换为 StatsD 格式
   */
  private convertToStatsD(metrics: TelemetryMetrics[]): string {
    const lines: string[] = [];

    for (const metric of metrics) {
      if (metric.eventLoop) {
        lines.push(`lobster.event_loop.lag.avg:${metric.eventLoop.avgLag}|ms`);
        lines.push(
          `lobster.event_loop.lag.p95:${metric.eventLoop.p95Lag || 0}|ms`,
        );
      }

      if (metric.system) {
        lines.push(`lobster.system.cpu:${metric.system.cpuUsage}|gauge`);
        lines.push(
          `lobster.system.memory.heap:${metric.system.memoryUsage.heapUsed}|bytes`,
        );
      }
    }

    return lines.join("\n") + "\n";
  }

  /**
   * 获取摘要统计
   */
  getSummary(): {
    uptime: number;
    metricsCollected: number;
    exportFormat: string;
    exportDir: string;
    sampleRate: number;
  } {
    const uptime = Date.now() - this.startTime;

    return {
      uptime,
      metricsCollected: this.buffer.length,
      exportFormat: this.config.format,
      exportDir: this.config.exportDir,
      sampleRate: this.config.sampleRate,
    };
  }

  /**
   * 关闭遥测收集器
   */
  async shutdown(): Promise<void> {
    this.flush();

    // 关闭所有文件流
    for (const stream of this.outputFileStreams.values()) {
      await new Promise<void>((resolve) => {
        stream.end(() => resolve());
      });
    }

    this.outputFileStreams.clear();
  }
}

/**
 * 创建遥测收集器
 */
export function createTelemetryCollector(
  config?: TelemetryConfig,
): TelemetryCollector {
  return new TelemetryCollector(config);
}

/**
 * 全局遥测收集器
 */
let globalTelemetryCollector: TelemetryCollector | null = null;

/**
 * 获取全局遥测收集器
 */
export function getGlobalTelemetryCollector(): TelemetryCollector {
  if (!globalTelemetryCollector) {
    globalTelemetryCollector = new TelemetryCollector();
  }
  return globalTelemetryCollector;
}

/**
 * 关闭全局遥测收集器
 */
export async function shutdownGlobalTelemetryCollector(): Promise<void> {
  if (globalTelemetryCollector) {
    await globalTelemetryCollector.shutdown();
    globalTelemetryCollector = null;
  }
}
