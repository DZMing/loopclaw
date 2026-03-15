/**
 * 🦞 龙虾 AST 性能优化模块
 *
 * 基于 TypeScript AST 分析的性能优化技术：
 * - Memoization: 缓存计算结果
 * - Incremental Analysis: 仅分析变更文件
 * - Checksum-based Invalidation: 基于内容哈希失效缓存
 *
 * @see {@link https://medium.com/@an.chmelev/typescript-performance-and-type-optimization-in-large-scale-projects-18e62bd37cfb}
 * @see {@link https://betterstack.com/community/guides/scaling-nodejs/esbuild-vs-swc/}
 */

import crypto from "crypto";

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  /** 计算结果 */
  value: T;
  /** 缓存时间戳 */
  timestamp: number;
  /** 文件内容哈希（用于失效） */
  checksum: string;
  /** 访问次数（用于 LRU） */
  hits: number;
}

/**
 * 缓存配置
 */
interface CacheConfig {
  /** 最大缓存条目数 */
  maxSize: number;
  /** 缓存过期时间（毫秒） */
  ttl: number;
}

/**
 * 默认缓存配置
 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 1000,
  ttl: 5 * 60 * 1000, // 5 分钟
};

/**
 * LRU 缓存实现
 *
 * 用于缓存 AST 分析结果，避免重复计算
 */
export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>>;
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.cache = new Map();
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * 获取缓存值
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - entry.timestamp > this.config.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // 增加访问次数
    entry.hits++;
    return entry.value;
  }

  /**
   * 设置缓存值
   */
  set(key: K, value: V, checksum?: string): void {
    // LRU: 如果缓存已满，删除最老的条目
    if (this.cache.size >= this.config.maxSize) {
      let oldestKey: K | null = null;
      let oldestTimestamp = Infinity;
      let lowestHits = Infinity;

      // 优先删除访问次数少且时间老的条目
      for (const [k, entry] of this.cache.entries()) {
        if (
          entry.hits < lowestHits ||
          (entry.hits === lowestHits && entry.timestamp < oldestTimestamp)
        ) {
          oldestKey = k;
          oldestTimestamp = entry.timestamp;
          lowestHits = entry.hits;
        }
      }

      if (oldestKey !== null) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      checksum: checksum || "",
      hits: 0,
    });
  }

  /**
   * 基于校验和失效
   */
  invalidateIfChanged(key: K, newChecksum: string): boolean {
    const entry = this.cache.get(key);
    if (entry && entry.checksum !== newChecksum) {
      this.cache.delete(key);
      return true;
    }
    return false;
  }

  /**
   * 删除单个缓存条目
   */
  delete(key: K): void {
    this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; totalHits: number } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
    }
    return {
      size: this.cache.size,
      totalHits,
    };
  }
}

/**
 * 文件分析缓存
 *
 * 基于文件内容的哈希进行缓存失效
 */
export class FileAnalysisCache<T> {
  private cache: LRUCache<string, T>;
  private checksums: Map<string, string>;

  constructor(config?: Partial<CacheConfig>) {
    this.cache = new LRUCache(config);
    this.checksums = new Map();
  }

  /**
   * 计算文件内容哈希
   */
  calculateChecksum(content: string): string {
    return crypto
      .createHash("md5")
      .update(content, "utf8")
      .digest("hex")
      .substring(0, 16); // 取前16位即可
  }

  /**
   * 获取分析结果
   */
  get(filePath: string, content: string): T | undefined {
    const checksum = this.calculateChecksum(content);

    // 检查内容是否变化
    this.cache.invalidateIfChanged(filePath, checksum);

    const result = this.cache.get(filePath);
    if (result) {
      this.checksums.set(filePath, checksum);
    }
    return result;
  }

  /**
   * 设置分析结果
   */
  set(filePath: string, content: string, value: T): void {
    const checksum = this.calculateChecksum(content);
    this.cache.set(filePath, value, checksum);
    this.checksums.set(filePath, checksum);
  }

  /**
   * 检查文件是否已缓存且未变化
   */
  hasValid(filePath: string, content: string): boolean {
    const checksum = this.calculateChecksum(content);
    const cachedChecksum = this.checksums.get(filePath);
    return (
      cachedChecksum === checksum && this.cache.get(filePath) !== undefined
    );
  }

  /**
   * 失效指定文件的缓存
   */
  invalidate(filePath: string): void {
    this.cache.delete(filePath);
    this.checksums.delete(filePath);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.checksums.clear();
  }
}

/**
 * Memoization 装饰器
 *
 * 自动缓存函数计算结果
 */
export function memoize<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
  keyFn?: (...args: Args) => string,
): (...args: Args) => Result {
  const cache = new Map<string, { value: Result; timestamp: number }>();
  const ttl = DEFAULT_CACHE_CONFIG.ttl;

  return (...args: Args): Result => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    const now = Date.now();

    const entry = cache.get(key);
    if (entry && now - entry.timestamp < ttl) {
      return entry.value;
    }

    const value = fn(...args);
    cache.set(key, { value, timestamp: now });

    // 清理过期缓存（最多保留 1000 个）
    if (cache.size > 1000) {
      const entries = Array.from(cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      // 删除最老的 10%
      for (let i = 0; i < Math.floor(entries.length * 0.1); i++) {
        cache.delete(entries[i][0]);
      }
    }

    return value;
  };
}

/**
 * 创建异步版本的 memoization
 */
export function memoizeAsync<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyFn?: (...args: Args) => string,
): (...args: Args) => Promise<Result> {
  const cache = new Map<string, { value: Result; timestamp: number }>();
  const ttl = DEFAULT_CACHE_CONFIG.ttl;

  return async (...args: Args): Promise<Result> => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    const now = Date.now();

    const entry = cache.get(key);
    if (entry && now - entry.timestamp < ttl) {
      return entry.value;
    }

    const value = await fn(...args);
    cache.set(key, { value, timestamp: now });

    return value;
  };
}

/**
 * 增量分析配置
 */
export interface IncrementalAnalysisConfig {
  /** 上次分析时间 */
  lastAnalysisTime: number;
  /** 已分析的文件及其哈希 */
  analyzedFiles: Map<string, string>;
  /** 变更的文件列表 */
  changedFiles: string[];
}

/**
 * 创建增量分析配置
 */
export function createIncrementalConfig(): IncrementalAnalysisConfig {
  return {
    lastAnalysisTime: 0,
    analyzedFiles: new Map(),
    changedFiles: [],
  };
}

/**
 * 检测文件是否变更
 */
export async function detectFileChanges(
  filePaths: string[],
  config: IncrementalAnalysisConfig,
  getChecksum: (path: string) => Promise<string>,
): Promise<string[]> {
  const changed: string[] = [];

  for (const filePath of filePaths) {
    const checksum = await getChecksum(filePath);
    const previousChecksum = config.analyzedFiles.get(filePath);

    if (previousChecksum !== checksum) {
      changed.push(filePath);
      config.analyzedFiles.set(filePath, checksum);
    }
  }

  return changed;
}
