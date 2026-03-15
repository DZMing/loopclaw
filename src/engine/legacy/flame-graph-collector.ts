/**
 * 🦞 龙虾火焰图收集器
 *
 * 收集函数调用栈的火焰图数据，用于性能分析和瓶颈识别
 * 基于 2026 Chrome DevTools Performance API 最佳实践
 *
 * @see {@link https://medium.com/@hadiyolworld007/node-js-performance-tuning-in-2026-event-loop-lag-fetch-backpressure-and-the-metrics-that-dff27b319415}
 */

import { performance, PerformanceObserver } from "perf_hooks";

/**
 * 火焰图节点
 */
export interface FlameGraphNode {
  /** 节点名称 */
  name: string;
  /** 函数类别 */
  category:
    | "scripting"
    | "rendering"
    | "painting"
    | "system"
    | "idle"
    | "other";
  /** 开始时间（微秒） */
  start: number;
  /** 持续时间（微秒） */
  duration: number;
  /** 深度（调用栈层级） */
  depth: number;
  /** 子节点 */
  children?: FlameGraphNode[];
  /** 自身时间（不含子调用） */
  selfTime: number;
}

/**
 * 火焰图数据
 */
export interface FlameGraphData {
  /** 根节点 */
  root: FlameGraphNode;
  /** 总样本数 */
  totalSamples: number;
  /** 收集开始时间 */
  startTime: number;
  /** 收集结束时间 */
  endTime: number;
  /** 最热路径（耗时最长） */
  hottestPath: FlameGraphNode[];
  /** 函数统计 */
  functionStats: Map<string, FunctionStats>;
}

/**
 * 函数统计
 */
export interface FunctionStats {
  /** 函数名称 */
  name: string;
  /** 调用次数 */
  callCount: number;
  /** 总耗时 */
  totalTime: number;
  /** 自身耗时 */
  selfTime: number;
  /** 平均耗时 */
  avgTime: number;
  /** 最大耗时 */
  maxTime: number;
  /** 最小耗时 */
  minTime: number;
}

/**
 * 调用栈帧
 */
interface StackFrame {
  name: string;
  category: FlameGraphNode["category"];
  startTime: number;
  children: StackFrame[];
}

/**
 * 火焰图配置
 */
export interface FlameGraphConfig {
  /** 最大样本数 */
  maxSamples?: number;
  /** 采样间隔（微秒） */
  sampleInterval?: number;
  /** 启用自动采样 */
  enableAutoSampling?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<FlameGraphConfig> = {
  maxSamples: 10000,
  sampleInterval: 100, // 100微秒
  enableAutoSampling: true,
};

/**
 * 火焰图收集器
 */
export class FlameGraphCollector {
  private config: Required<FlameGraphConfig>;
  private samples: FlameGraphNode[] = [];
  private stacks: Map<string, StackFrame> = new Map();
  private functionStats: Map<string, FunctionStats> = new Map();
  private startTime = 0;
  private endTime = 0;
  private isCollecting = false;

  // 性能观察者
  private perfObserver?: PerformanceObserver;

  constructor(config: FlameGraphConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 开始收集火焰图数据
   */
  start(): void {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;
    this.startTime = performance.now();
    this.samples = [];
    this.functionStats.clear();

    // 设置性能观察者
    this.setupPerformanceObserver();
  }

  /**
   * 停止收集
   */
  stop(): FlameGraphData {
    if (!this.isCollecting) {
      throw new Error("火焰图收集未启动");
    }

    this.isCollecting = false;
    this.endTime = performance.now();

    if (this.perfObserver) {
      this.perfObserver.disconnect();
    }

    return this.buildFlameGraph();
  }

  /**
   * 记录函数调用
   */
  recordFunction(
    name: string,
    category: FlameGraphNode["category"] = "other",
  ): () => void {
    if (!this.isCollecting) {
      return () => {};
    }

    const startTime = performance.now();
    const depth = this.getCurrentDepth();

    // 创建节点
    const node: FlameGraphNode = {
      name,
      category,
      start: startTime * 1000, // 转换为微秒
      duration: 0,
      depth,
      selfTime: 0,
    };

    return () => {
      const endTime = performance.now();
      node.duration = (endTime - startTime) * 1000;
      node.selfTime = node.duration; // 初始值，后续会减去子节点时间
      this.samples.push(node);
      this.updateFunctionStats(name, node.duration);
    };
  }

  /**
   * 记录异步操作
   */
  async recordAsync<T>(
    name: string,
    fn: () => Promise<T>,
    category: FlameGraphNode["category"] = "scripting",
  ): Promise<T> {
    const endRecording = this.recordFunction(name, category);

    try {
      const result = await fn();
      endRecording();
      return result;
    } catch (error) {
      endRecording();
      throw error;
    }
  }

  /**
   * 获取最热路径
   */
  getHottestPath(): FlameGraphNode[] {
    const sortedNodes = [...this.samples].sort(
      (a, b) => b.duration - a.duration,
    );
    return sortedNodes.slice(0, 10);
  }

  /**
   * 获取瓶颈函数
   */
  getBottlenecks(
    limit: number = 5,
  ): Array<{ name: string; totalTime: number; percentage: number }> {
    const totalTime = this.endTime - this.startTime;
    const stats = Array.from(this.functionStats.values())
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, limit)
      .map((stat) => ({
        name: stat.name,
        totalTime: stat.totalTime,
        percentage: (stat.totalTime / totalTime) * 100,
      }));

    return stats;
  }

  /**
   * 导出为 Chrome Trace 格式
   */
  exportToChromeTrace(): string {
    const events = this.samples.map((node) => ({
      name: node.name,
      cat: node.category,
      ph: "X",
      ts: node.start,
      dur: node.duration,
      pid: 1,
      tid: 1,
    }));

    return JSON.stringify({ traceEvents: events });
  }

  /**
   * 导出为火焰图文本
   */
  exportToAscii(): string {
    const lines: string[] = [];
    const hottestPath = this.getHottestPath();

    for (const node of hottestPath) {
      const indent = "  ".repeat(node.depth);
      const durationMs = node.duration / 1000;
      const bar = "█".repeat(Math.min(50, Math.floor(durationMs / 10)));
      lines.push(`${indent}${node.name} ${bar} ${durationMs.toFixed(2)}ms`);
    }

    return lines.join("\n");
  }

  /**
   * 设置性能观察者
   */
  private setupPerformanceObserver(): void {
    this.perfObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        if (entry.entryType === "measure") {
          const node: FlameGraphNode = {
            name: entry.name,
            category: "other",
            start: entry.startTime * 1000,
            duration: entry.duration * 1000,
            depth: 0,
            selfTime: entry.duration * 1000,
          };
          this.samples.push(node);
          this.updateFunctionStats(entry.name, node.duration * 1000);
        }
      }
    });
    this.perfObserver.observe({ entryTypes: ["measure"] });
  }

  /**
   * 获取当前调用栈深度
   */
  private getCurrentDepth(): number {
    const stack = new Error().stack;
    if (!stack) {
      return 0;
    }

    // 计算调用栈深度（排除 Error、current function 等）
    const lines = stack.split("\n");
    return Math.max(0, lines.length - 3);
  }

  /**
   * 更新函数统计
   */
  private updateFunctionStats(name: string, duration: number): void {
    let stats = this.functionStats.get(name);

    if (!stats) {
      stats = {
        name,
        callCount: 0,
        totalTime: 0,
        selfTime: 0,
        avgTime: 0,
        maxTime: 0,
        minTime: Infinity,
      };
      this.functionStats.set(name, stats);
    }

    stats.callCount++;
    stats.totalTime += duration;
    stats.selfTime += duration;
    stats.avgTime = stats.totalTime / stats.callCount;
    stats.maxTime = Math.max(stats.maxTime, duration);
    stats.minTime = Math.min(stats.minTime, duration);
  }

  /**
   * 构建火焰图
   */
  private buildFlameGraph(): FlameGraphData {
    const root: FlameGraphNode = {
      name: "root",
      category: "other",
      start: this.startTime * 1000,
      duration: (this.endTime - this.startTime) * 1000,
      depth: 0,
      selfTime: 0,
      children: [],
    };

    // 构建树形结构
    const tree = this.buildTree(this.samples);

    // 计算最热路径
    const hottestPath = this.getHottestPath();

    return {
      root,
      totalSamples: this.samples.length,
      startTime: this.startTime,
      endTime: this.endTime,
      hottestPath,
      functionStats: this.functionStats,
    };
  }

  /**
   * 构建调用树
   */
  private buildTree(nodes: FlameGraphNode[]): FlameGraphNode[] {
    // 按开始时间排序
    const sorted = [...nodes].sort((a, b) => a.start - b.start);

    // 构建父子关系
    const result: FlameGraphNode[] = [];
    const stack: FlameGraphNode[] = [];

    for (const node of sorted) {
      // 弹出已结束的节点
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.start + top.duration <= node.start) {
          stack.pop();
        } else {
          break;
        }
      }

      // 设置父子关系
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(node);
        node.depth = parent.depth + 1;

        // 从父节点自身时间中减去子节点时间
        parent.selfTime -= node.duration;
      } else {
        result.push(node);
      }

      stack.push(node);
    }

    return result;
  }

  /**
   * 重置收集器
   */
  reset(): void {
    this.samples = [];
    this.functionStats.clear();
    this.stacks.clear();
  }

  /**
   * 获取统计摘要
   */
  getSummary(): {
    totalSamples: number;
    collectionDuration: number;
    topFunctions: Array<{ name: string; totalTime: number; callCount: number }>;
    averageDepth: number;
  } {
    const totalSamples = this.samples.length;
    const collectionDuration = this.endTime - this.startTime;
    const topFunctions = Array.from(this.functionStats.values())
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, 10)
      .map(({ name, totalTime, callCount }) => ({
        name,
        totalTime,
        callCount,
      }));

    const totalDepth = this.samples.reduce((sum, node) => sum + node.depth, 0);
    const averageDepth = totalSamples > 0 ? totalDepth / totalSamples : 0;

    return {
      totalSamples,
      collectionDuration,
      topFunctions,
      averageDepth,
    };
  }
}

/**
 * 创建火焰图收集器
 */
export function createFlameGraphCollector(
  config?: FlameGraphConfig,
): FlameGraphCollector {
  return new FlameGraphCollector(config);
}

/**
 * 装饰器：自动记录函数性能
 */
export function flameGraph(
  name?: string,
  category: FlameGraphNode["category"] = "scripting",
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const functionName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      // 获取或创建火焰图收集器
      let collector: FlameGraphCollector;
      if (!(globalThis as any).__flameGraphCollector) {
        (globalThis as any).__flameGraphCollector = createFlameGraphCollector();
      }
      collector = (globalThis as any).__flameGraphCollector;

      if (collector) {
        return await collector.recordAsync(
          functionName,
          () => originalMethod.apply(this, args),
          category,
        );
      } else {
        return await originalMethod.apply(this, args);
      }
    };

    return descriptor;
  };
}

/**
 * 获取全局火焰图收集器
 */
export function getGlobalFlameGraphCollector():
  | FlameGraphCollector
  | undefined {
  return (globalThis as any).__flameGraphCollector;
}

/**
 * 启动全局火焰图收集
 */
export function startGlobalFlameGraphCollection(
  config?: FlameGraphConfig,
): FlameGraphCollector {
  const collector = createFlameGraphCollector(config);
  (globalThis as any).__flameGraphCollector = collector;
  collector.start();
  return collector;
}

/**
 * 停止并获取火焰图数据
 */
export function stopGlobalFlameGraphCollection(): FlameGraphData | undefined {
  const collector = (globalThis as any).__flameGraphCollector;
  if (collector) {
    const data = collector.stop();
    (globalThis as any).__flameGraphCollector = undefined;
    return data;
  }
  return undefined;
}
