/**
 * 🦞 龙虾异步上下文追踪器
 *
 * 基于 Node.js async_hooks 实现异步上下文追踪
 * 防止 2026年1月 DoS 漏洞
 *
 * @see {@link https://nodejs.org/en/blog/vulnerability/january-2026-dos-mitigation-async-hooks}
 * @see {@link https://nodejs.org/api/async_context.html}
 */

import {
  createHook,
  executionAsyncId,
  executionAsyncResource,
} from "async_hooks";

/**
 * 上下文信息
 */
export interface ContextInfo {
  /** 上下文ID */
  asyncId: number;
  /** 触发异步ID */
  triggerAsyncId: number;
  /** 资源类型 */
  type?: string;
  /** 资源名称 */
  name?: string;
  /** 创建时间 */
  timestamp: number;
}

/**
 * 异步资源统计
 */
export interface AsyncResourceStats {
  /** 资源类型 */
  type: string;
  /** 当前数量 */
  count: number;
  /** 峰值数量 */
  peakCount: number;
  /** 平均生命周期（毫秒） */
  avgLifetime: number;
}

/**
 * 追踪配置
 */
export interface AsyncTrackerConfig {
  /** 最大追踪深度 */
  maxDepth?: number;
  /** 启用资源统计 */
  enableResourceStats?: boolean;
  /** 启用堆栈追踪 */
  enableStackTrace?: boolean;
  /** 警告阈值（毫秒） */
  warnThreshold?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<AsyncTrackerConfig> = {
  maxDepth: 100,
  enableResourceStats: true,
  enableStackTrace: false,
  warnThreshold: 5000, // 5秒
};

/**
 * 链路信息
 */
interface ChainLink {
  asyncId: number;
  parentAsyncId: number | null;
  depth: number;
  timestamp: number;
  resource?: ContextInfo;
}

/**
 * 异步上下文追踪器
 */
export class AsyncContextTracker {
  private config: Required<AsyncTrackerConfig>;
  private chains: Map<number, ChainLink[]> = new Map();
  private resources: Map<number, ContextInfo> = new Map();
  private resourceStats: Map<string, AsyncResourceStats> = new Map();
  private hook: any;
  private active = false;

  constructor(config: AsyncTrackerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hook = createHook({
      init: (asyncId, type, triggerAsyncId, resource) => {
        this.trackInit(asyncId, type, triggerAsyncId, resource);
      },
      before: (asyncId) => {
        this.trackBefore(asyncId);
      },
      after: (asyncId) => {
        this.trackAfter(asyncId);
      },
      destroy: (asyncId) => {
        this.trackDestroy(asyncId);
      },
    });
  }

  /**
   * 启动追踪
   */
  start(): void {
    this.active = true;
    this.hook.enable();
    console.log("🦞 异步上下文追踪已启动");
  }

  /**
   * 停止追踪
   */
  stop(): void {
    this.active = false;
    this.hook.disable();
    console.log("🦞 异步上下文追踪已停止");
  }

  /**
   * 获取活动状态
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * 追踪初始化
   */
  private trackInit(
    asyncId: number,
    type: string,
    triggerAsyncId: number,
    resource: object,
  ): void {
    // 仅在活动状态下追踪
    if (!this.active) return;
    const timestamp = Date.now();

    // 记录资源
    const resourceInfo: ContextInfo = {
      asyncId,
      triggerAsyncId,
      type,
      name: this.getResourceName(resource),
      timestamp,
    };
    this.resources.set(asyncId, resourceInfo);

    // 记录链路
    const parentAsyncId = this.getCurrentParentAsyncId();
    const depth = parentAsyncId
      ? (this.chains.get(parentAsyncId)?.[0]?.depth || 0) + 1
      : 0;

    const link: ChainLink = {
      asyncId,
      parentAsyncId,
      depth,
      timestamp,
      resource: resourceInfo,
    };

    if (!this.chains.has(asyncId)) {
      this.chains.set(asyncId, []);
    }
    this.chains.get(asyncId)!.push(link);

    // 更新资源统计
    if (this.config.enableResourceStats) {
      this.updateResourceStats(type, 1);
    }

    // 检查深度限制（防止 DoS）
    if (depth > this.config.maxDepth) {
      console.warn(`⚠️ 异步深度超标: ${depth} > ${this.config.maxDepth}`);
    }
  }

  /**
   * 追踪执行前
   */
  private trackBefore(asyncId: number): void {
    if (!this.active) return;
    // 记录开始时间
    const link = this.getCurrentLink(asyncId);
    if (link) {
      link.timestamp = Date.now();
    }
  }

  /**
   * 追踪执行后
   */
  private trackAfter(asyncId: number): void {
    if (!this.active) return;
    const link = this.getCurrentLink(asyncId);
    if (link) {
      const duration = Date.now() - link.timestamp;

      // 检查长时操作
      if (duration > this.config.warnThreshold) {
        console.warn(
          `⚠️ 长时异步操作: ${link.resource?.type || "unknown"} ${duration}ms`,
        );
      }
    }
  }

  /**
   * 追踪销毁
   */
  private trackDestroy(asyncId: number): void {
    if (!this.active) return;
    const resource = this.resources.get(asyncId);
    if (resource && this.config.enableResourceStats) {
      this.updateResourceStats(resource.type!, -1);
    }

    this.resources.delete(asyncId);
    this.chains.delete(asyncId);
  }

  /**
   * 获取当前父级异步ID
   */
  private getCurrentParentAsyncId(): number | null {
    const resource = executionAsyncResource();
    return (resource as any)?.asyncId || null;
  }

  /**
   * 获取当前链路
   */
  private getCurrentLink(asyncId: number): ChainLink | undefined {
    const chain = this.chains.get(asyncId);
    return chain?.[chain.length - 1];
  }

  /**
   * 更新资源统计
   */
  private updateResourceStats(type: string, delta: number): void {
    let stats = this.resourceStats.get(type);

    if (!stats) {
      stats = {
        type,
        count: 0,
        peakCount: 0,
        avgLifetime: 0,
      };
      this.resourceStats.set(type, stats);
    }

    stats.count += delta;
    stats.peakCount = Math.max(stats.peakCount, stats.count);
  }

  /**
   * 获取资源名称
   */
  private getResourceName(resource: object): string {
    if (!resource) return "unknown";

    const ctor = (resource as any).constructor;
    return ctor?.name || "unknown";
  }

  /**
   * 获取当前上下文
   */
  getCurrentContext(): ContextInfo | undefined {
    const asyncId = executionAsyncId();
    return this.resources.get(asyncId);
  }

  /**
   * 获取上下文链路
   */
  getContextChain(): ContextInfo[] {
    const chain: ContextInfo[] = [];
    let asyncId: number | null = executionAsyncId();

    while (asyncId !== null) {
      const resource = this.resources.get(asyncId);
      if (resource) {
        chain.unshift(resource);
      }

      const link: ChainLink | undefined = this.chains.get(asyncId)?.[0];
      asyncId = link?.parentAsyncId || null;
    }

    return chain;
  }

  /**
   * 获取深度
   */
  getDepth(): number {
    const asyncId = executionAsyncId();
    const link = this.chains.get(asyncId)?.[0];
    return link?.depth || 0;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalResources: number;
    activeChains: number;
    averageDepth: number;
    resourceStats: Map<string, AsyncResourceStats>;
    leakedResources: number;
  } {
    let totalDepth = 0;
    let depthCount = 0;

    for (const chain of this.chains.values()) {
      for (const link of chain) {
        totalDepth += link.depth;
        depthCount++;
      }
    }

    // 检测潜在泄漏（超过阈值深度的资源）
    const leakedResources = Array.from(this.resources.values()).filter((r) => {
      const link = this.chains.get(r.asyncId)?.[0];
      return link && link.depth > this.config.maxDepth;
    }).length;

    return {
      totalResources: this.resources.size,
      activeChains: this.chains.size,
      averageDepth: depthCount > 0 ? totalDepth / depthCount : 0,
      resourceStats: new Map(this.resourceStats),
      leakedResources,
    };
  }

  /**
   * 检测内存泄漏
   */
  detectMemoryLeaks(): {
    leaked: ContextInfo[];
    suspicious: ContextInfo[];
  } {
    const suspicious: ContextInfo[] = [];
    const leaked: ContextInfo[] = [];

    for (const [asyncId, resource] of this.resources) {
      const link = this.chains.get(asyncId)?.[0];

      if (!link) {
        // 孤立资源
        suspicious.push(resource);
      } else if (link.depth > this.config.maxDepth) {
        // 深度过高
        leaked.push(resource);
      }
    }

    return { leaked, suspicious };
  }

  /**
   * 清除已销毁的资源
   */
  cleanup(): number {
    let cleaned = 0;

    for (const asyncId of this.resources.keys()) {
      if (!this.chains.has(asyncId)) {
        this.resources.delete(asyncId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 导出追踪报告
   */
  exportReport(): string {
    const stats = this.getStats();
    const { leaked, suspicious } = this.detectMemoryLeaks();

    return `
🦞 异步上下文追踪报告

=== 统计信息 ===
活跃资源: ${stats.totalResources}
活跃链路: ${stats.activeChains}
平均深度: ${stats.averageDepth.toFixed(2)}
疑似泄漏: ${leaked.length + suspicious.length}

=== 资源统计 ===
${Array.from(stats.resourceStats.values())
  .map((s) => `- ${s.type}: ${s.count} (峰值: ${s.peakCount})`)
  .join("\n")}

${
  leaked.length > 0
    ? `
=== 检测到泄漏 ===
${leaked.map((r) => `- ${r.type} (${r.asyncId})`).join("\n")}
`
    : ""
}
    `.trim();
  }
}

/**
 * 创建异步上下文追踪器
 */
export function createAsyncTracker(
  config?: AsyncTrackerConfig,
): AsyncContextTracker {
  return new AsyncContextTracker(config);
}

/**
 * 获取全局追踪器
 */
let globalTracker: AsyncContextTracker | undefined;

export function getGlobalTracker(): AsyncContextTracker {
  if (!globalTracker) {
    globalTracker = createAsyncTracker();
    globalTracker.start();
  }
  return globalTracker;
}

/**
 * 装饰器：自动追踪异步上下文
 */
export function trackAsync(contextType?: string) {
  return function (
    _target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const tracker = getGlobalTracker();
      const context = tracker?.getCurrentContext();

      // 记录方法调用
      if (context) {
        console.log(`[${contextType || "Async"}] ${propertyKey}`);
      }

      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * 装饰器：限制异步深度
 */
export function limitAsyncDepth(maxDepth: number) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const tracker = getGlobalTracker();
      const depth = tracker?.getDepth() || 0;

      if (depth > maxDepth) {
        throw new Error(`异步深度超限: ${depth} > ${maxDepth}`);
      }

      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
