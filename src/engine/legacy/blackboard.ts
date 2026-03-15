/**
 * 🦞 龙虾黑板模式
 *
 * 实现黑板模式（Blackboard Pattern）用于多代理共享数据空间
 * 基于 2026 AI Agent 架构最佳实践
 *
 * @see {@link https://www.openlayer.com/blog/post/multi-agent-system-architecture-guide}
 * @see {@link https://redis.io/blog/ai-agent-architecture/}
 */

/**
 * 黑板条目
 */
export interface BlackboardEntry {
  /** 条目ID */
  id: string;
  /** 键名 */
  key: string;
  /** 值 */
  value: any;
  /** 写入者ID */
  writer: string;
  /** 读取者ID列表 */
  readers: Set<string>;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 过期时间 */
  expiresAt?: number;
  /** 标签 */
  tags?: Set<string>;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 黑板事件
 */
export interface BlackboardEvent {
  /** 事件类型 */
  type: "write" | "read" | "delete" | "expire";
  /** 条目ID */
  entryId: string;
  /** 键名 */
  key: string;
  /** 代理ID */
  agentId: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 黑板配置
 */
export interface BlackboardConfig {
  /** 最大条目数 */
  maxEntries?: number;
  /** 默认过期时间（毫秒） */
  defaultTTL?: number;
  /** 启用自动过期清理 */
  enableAutoCleanup?: boolean;
  /** 清理间隔（毫秒） */
  cleanupInterval?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<BlackboardConfig> = {
  maxEntries: 10000,
  defaultTTL: 3600000, // 1小时
  enableAutoCleanup: true,
  cleanupInterval: 60000, // 1分钟
};

/**
 * 查询选项
 */
export interface QueryOptions {
  /** 标签过滤 */
  tags?: string[];
  /** 键名前缀 */
  keyPrefix?: string;
  /** 写入者过滤 */
  writer?: string;
  /** 包含元数据 */
  metadata?: Record<string, any>;
}

/**
 * 黑板模式实现
 *
 * 提供共享数据空间，支持多代理读写
 */
export class Blackboard {
  private entries: Map<string, BlackboardEntry> = new Map();
  private keyIndex: Map<string, Set<string>> = new Map(); // key -> entryIds
  private tagIndex: Map<string, Set<string>> = new Map(); // tag -> entryIds
  private config: Required<BlackboardConfig>;
  private eventListeners: Map<string, Set<(event: BlackboardEvent) => void>> =
    new Map();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: BlackboardConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enableAutoCleanup) {
      this.startCleanup();
    }
  }

  /**
   * 写入数据
   */
  write(
    key: string,
    value: any,
    writer: string,
    options?: {
      ttl?: number;
      tags?: string[];
      metadata?: Record<string, any>;
    },
  ): string {
    const entryId = `${key}_${writer}_${Date.now()}`;
    const now = Date.now();

    const entry: BlackboardEntry = {
      id: entryId,
      key,
      value,
      writer,
      readers: new Set(),
      createdAt: now,
      updatedAt: now,
      tags: options?.tags ? new Set(options.tags) : undefined,
      metadata: options?.metadata,
    };

    if (options?.ttl) {
      entry.expiresAt = now + options.ttl;
    }

    // 检查容量限制
    if (this.entries.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    // 删除旧条目（同一写入者）
    this.deleteByKeyAndWriter(key, writer);

    // 存储条目
    this.entries.set(entryId, entry);

    // 更新索引
    this.updateIndexes(entry);

    // 触发事件
    this.emitEvent({
      type: "write",
      entryId,
      key,
      agentId: writer,
      timestamp: now,
    });

    return entryId;
  }

  /**
   * 读取数据
   */
  read(
    key: string,
    reader: string,
    options?: {
      writer?: string;
      freshest?: boolean; // 获取最新的条目
    },
  ): any | undefined {
    const entryIds = this.keyIndex.get(key);
    if (!entryIds || entryIds.size === 0) {
      return undefined;
    }

    let targetEntry: BlackboardEntry | undefined;

    if (options?.writer) {
      // 获取特定写入者的条目
      for (const entryId of entryIds) {
        const entry = this.entries.get(entryId);
        if (entry && entry.writer === options.writer) {
          targetEntry = entry;
          break;
        }
      }
    } else if (options?.freshest) {
      // 获取最新的条目
      let latestTime = 0;
      for (const entryId of entryIds) {
        const entry = this.entries.get(entryId);
        if (entry && entry.updatedAt > latestTime) {
          latestTime = entry.updatedAt;
          targetEntry = entry;
        }
      }
    } else {
      // 获取任意条目
      const firstEntryId = entryIds.values().next().value;
      if (firstEntryId) {
        targetEntry = this.entries.get(firstEntryId);
      }
    }

    if (targetEntry) {
      // 记录读取者
      targetEntry.readers.add(reader);

      // 触发事件
      this.emitEvent({
        type: "read",
        entryId: targetEntry.id,
        key,
        agentId: reader,
        timestamp: Date.now(),
      });

      return targetEntry.value;
    }

    return undefined;
  }

  /**
   * 读取所有值（同一key）
   */
  readAll(
    key: string,
    reader: string,
  ): Array<{ value: any; writer: string; createdAt: number }> {
    const entryIds = this.keyIndex.get(key);
    if (!entryIds) {
      return [];
    }

    const results: Array<{ value: any; writer: string; createdAt: number }> =
      [];

    for (const entryId of entryIds) {
      const entry = this.entries.get(entryId);
      if (entry) {
        entry.readers.add(reader);
        results.push({
          value: entry.value,
          writer: entry.writer,
          createdAt: entry.createdAt,
        });

        this.emitEvent({
          type: "read",
          entryId,
          key,
          agentId: reader,
          timestamp: Date.now(),
        });
      }
    }

    return results.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * 检查键是否存在
   */
  has(key: string): boolean {
    const entryIds = this.keyIndex.get(key);
    return entryIds !== undefined && entryIds.size > 0;
  }

  /**
   * 删除数据
   */
  delete(key: string, agentId: string): boolean {
    const entryIds = this.keyIndex.get(key);
    if (!entryIds) {
      return false;
    }

    let deleted = false;
    for (const entryId of entryIds) {
      const entry = this.entries.get(entryId);
      if (entry && (entry.writer === agentId || entry.readers.has(agentId))) {
        this.deleteEntry(entryId);
        deleted = true;

        this.emitEvent({
          type: "delete",
          entryId,
          key,
          agentId,
          timestamp: Date.now(),
        });
      }
    }

    return deleted;
  }

  /**
   * 查询数据
   */
  query(
    options: QueryOptions,
  ): Array<{ key: string; value: any; entry: BlackboardEntry }> {
    const results: Array<{ key: string; value: any; entry: BlackboardEntry }> =
      [];

    for (const entry of this.entries.values()) {
      // 检查是否过期
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        continue;
      }

      // 标签过滤
      if (options.tags && options.tags.length > 0) {
        const hasAllTags = options.tags.every((tag) => entry.tags?.has(tag));
        if (!hasAllTags) {
          continue;
        }
      }

      // 键名前缀过滤
      if (options.keyPrefix && !entry.key.startsWith(options.keyPrefix)) {
        continue;
      }

      // 写入者过滤
      if (options.writer && entry.writer !== options.writer) {
        continue;
      }

      // 元数据过滤
      if (options.metadata) {
        const matches = Object.entries(options.metadata).every(
          ([k, v]) => entry.metadata?.[k] === v,
        );
        if (!matches) {
          continue;
        }
      }

      results.push({
        key: entry.key,
        value: entry.value,
        entry,
      });
    }

    return results;
  }

  /**
   * 订阅键变化
   */
  subscribe(
    key: string,
    callback: (value: any, entry: BlackboardEntry) => void,
  ): () => void {
    const eventName = `write:${key}`;
    const listener = (event: BlackboardEvent) => {
      if (event.type === "write" && event.key === key) {
        const entry = this.entries.get(event.entryId);
        if (entry) {
          callback(entry.value, entry);
        }
      }
    };

    this.on(eventName, listener);

    // 返回取消订阅函数
    return () => this.off(eventName, listener);
  }

  /**
   * 添加事件监听器
   */
  on(event: string, callback: (event: BlackboardEvent) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * 移除事件监听器
   */
  off(event: string, callback: (event: BlackboardEvent) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.eventListeners.delete(event);
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalEntries: number;
    uniqueKeys: number;
    totalReaders: number;
    entriesByWriter: Map<string, number>;
    entriesByTag: Map<string, number>;
  } {
    const entriesByWriter = new Map<string, number>();
    const entriesByTag = new Map<string, number>();
    let totalReaders = 0;

    for (const entry of this.entries.values()) {
      // 按写入者统计
      entriesByWriter.set(
        entry.writer,
        (entriesByWriter.get(entry.writer) || 0) + 1,
      );

      // 按标签统计
      if (entry.tags) {
        for (const tag of entry.tags) {
          entriesByTag.set(tag, (entriesByTag.get(tag) || 0) + 1);
        }
      }

      // 统计读取者
      totalReaders += entry.readers.size;
    }

    return {
      totalEntries: this.entries.size,
      uniqueKeys: this.keyIndex.size,
      totalReaders,
      entriesByWriter,
      entriesByTag,
    };
  }

  /**
   * 清理过期条目
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [entryId, entry] of this.entries) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.deleteEntry(entryId);
        cleaned++;

        this.emitEvent({
          type: "expire",
          entryId,
          key: entry.key,
          agentId: "system",
          timestamp: now,
        });
      }
    }

    return cleaned;
  }

  /**
   * 清空黑板
   */
  clear(): void {
    this.entries.clear();
    this.keyIndex.clear();
    this.tagIndex.clear();
  }

  /**
   * 关闭黑板
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
    this.eventListeners.clear();
  }

  /**
   * 更新索引
   */
  private updateIndexes(entry: BlackboardEntry): void {
    // 更新键索引
    if (!this.keyIndex.has(entry.key)) {
      this.keyIndex.set(entry.key, new Set());
    }
    this.keyIndex.get(entry.key)!.add(entry.id);

    // 更新标签索引
    if (entry.tags) {
      for (const tag of entry.tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)!.add(entry.id);
      }
    }
  }

  /**
   * 删除条目
   */
  private deleteEntry(entryId: string): void {
    const entry = this.entries.get(entryId);
    if (!entry) {
      return;
    }

    // 从键索引移除
    const keyEntries = this.keyIndex.get(entry.key);
    if (keyEntries) {
      keyEntries.delete(entryId);
      if (keyEntries.size === 0) {
        this.keyIndex.delete(entry.key);
      }
    }

    // 从标签索引移除
    if (entry.tags) {
      for (const tag of entry.tags) {
        const tagEntries = this.tagIndex.get(tag);
        if (tagEntries) {
          tagEntries.delete(entryId);
          if (tagEntries.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      }
    }

    // 删除条目
    this.entries.delete(entryId);
  }

  /**
   * 按键和写入者删除
   */
  private deleteByKeyAndWriter(key: string, writer: string): void {
    const entryIds = this.keyIndex.get(key);
    if (!entryIds) {
      return;
    }

    for (const entryId of entryIds) {
      const entry = this.entries.get(entryId);
      if (entry && entry.writer === writer) {
        this.deleteEntry(entryId);
      }
    }
  }

  /**
   * 驱逐最旧条目
   */
  private evictOldest(): void {
    let oldestEntry: BlackboardEntry | undefined;
    let oldestTime = Infinity;

    for (const entry of this.entries.values()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestEntry = entry;
      }
    }

    if (oldestEntry) {
      this.deleteEntry(oldestEntry.id);
    }
  }

  /**
   * 触发事件
   */
  private emitEvent(event: BlackboardEvent): void {
    const genericListeners = this.eventListeners.get("*");
    const specificListeners = this.eventListeners.get(event.type);

    if (genericListeners) {
      for (const listener of genericListeners) {
        try {
          listener(event);
        } catch (error) {
          console.error("黑板事件监听器错误:", error);
        }
      }
    }

    if (specificListeners) {
      for (const listener of specificListeners) {
        try {
          listener(event);
        } catch (error) {
          console.error("黑板事件监听器错误:", error);
        }
      }
    }
  }

  /**
   * 启动自动清理
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }
}

/**
 * 创建黑板
 */
export function createBlackboard(config?: BlackboardConfig): Blackboard {
  return new Blackboard(config);
}

/**
 * 全局黑板实例
 */
let globalBlackboard: Blackboard | undefined;

/**
 * 获取全局黑板
 */
export function getGlobalBlackboard(): Blackboard {
  if (!globalBlackboard) {
    globalBlackboard = createBlackboard();
  }
  return globalBlackboard;
}

/**
 * 关闭全局黑板
 */
export function closeGlobalBlackboard(): void {
  if (globalBlackboard) {
    globalBlackboard.shutdown();
    globalBlackboard = undefined;
  }
}
