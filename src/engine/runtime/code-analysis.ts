/**
 * 代码分析模块
 *
 * 负责代码库和目录的分析功能，包括缓存管理。
 *
 * @version 2.48.0
 * @since 2026-03-13
 * @author Claude Code
 */

import fs from "fs/promises";
import path from "path";
import type { OpenClawPluginServiceContext } from "../../types.js";
import type { EngineConfig } from "../../config.js";
import {
  LobsterCodeAnalyzer,
  type CodeQualityReport,
} from "../code-analyzer.js";

/** 类型导入 */
import type { EngineLogger } from "./runtime-context.js";

/**
 * 文件扩展名常量
 * @internal
 */
const FileExtensions = {
  /** TypeScript 文件 */
  TYPESCRIPT: ".ts",
  /** JavaScript 文件 */
  JAVASCRIPT: ".js",
  /** JSON 文件 */
  JSON: ".json",
  /** Markdown 文件 */
  MARKDOWN: ".md",
} as const;

/**
 * 响应消息常量
 * @internal
 */
const ResponseMessages = {
  /** 代码库分析完成 */
  CODEBASE_ANALYSIS_COMPLETE: "📊 代码库分析完成",
  /** 工作区分析完成 */
  WORKSPACE_ANALYSIS_COMPLETE: "📁 工作区分析完成",
} as const;

/**
 * 文件缓存条目
 */
interface FileCacheEntry {
  /** 缓存的数据 */
  data: string[];
  /** 缓存时间戳 */
  timestamp: number;
}

/**
 * 文件类型统计
 */
interface FileTypeStats {
  /** TypeScript 文件数 */
  ts: number;
  /** JavaScript 文件数 */
  js: number;
  /** JSON 文件数 */
  json: number;
  /** Markdown 文件数 */
  md: number;
}

/**
 * 安全调用 debug 日志
 * @param logger 日志记录器
 * @param message 日志消息
 * @internal
 */
function safeDebug(logger: EngineLogger, message: string): void {
  if (logger.debug) {
    logger.debug(message);
  }
}

/**
 * 代码分析管理器
 *
 * 负责代码库和目录的分析功能，包括缓存管理。
 */
export class CodeAnalysisManager {
  private fileCache = new Map<string, FileCacheEntry>();

  constructor(
    private readonly api: { logger: EngineLogger },
    private readonly config: EngineConfig,
  ) {}

  /**
   * 分析代码库
   *
   * 使用 LobsterCodeAnalyzer 深度分析 TypeScript/JavaScript 代码库。
   *
   * @param ctx 服务上下文
   * @returns Promise 分析结果消息
   */
  async analyzeCodebase(ctx: OpenClawPluginServiceContext): Promise<string> {
    try {
      const workspaceDir = ctx.workspaceDir;
      if (!workspaceDir) {
        return ResponseMessages.CODEBASE_ANALYSIS_COMPLETE;
      }

      const analyzer = new LobsterCodeAnalyzer();
      const result = await analyzer.analyzeProject(workspaceDir);

      safeDebug(this.api.logger, `🔍 分析 ${result.files.length} 个文件`);
      safeDebug(this.api.logger, `⏱️  总问题: ${result.totalIssues}`);

      return `${ResponseMessages.CODEBASE_ANALYSIS_COMPLETE}\n${this.formatAnalysisResult(result)}`;
    } catch (error) {
      safeDebug(
        this.api.logger,
        `代码库分析失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      return ResponseMessages.CODEBASE_ANALYSIS_COMPLETE;
    }
  }

  /**
   * 分析目录
   *
   * 通用目录分析方法，统计文件类型和数量。
   *
   * @param ctx 服务上下文
   * @param targetDir 目标目录（可选，默认为工作目录）
   * @returns Promise 分析结果消息
   */
  async analyzeDirectory(
    ctx: OpenClawPluginServiceContext,
    targetDir?: string,
  ): Promise<string> {
    const label = targetDir ? "目录" : "工作区";
    const dirPath = targetDir ?? ctx.workspaceDir ?? ".";

    try {
      const files = await this.getCachedFiles(dirPath);
      const stats = this.countFileTypes(files);

      safeDebug(this.api.logger, `📂 ${label}包含 ${files.length} 个文件`);

      const report = [
        `${ResponseMessages.WORKSPACE_ANALYSIS_COMPLETE}`,
        `📊 ${label}: ${dirPath}`,
        `📁 总文件: ${files.length}`,
        stats.ts > 0 ? `📘 TypeScript: ${stats.ts}` : "",
        stats.js > 0 ? `📙 JavaScript: ${stats.js}` : "",
        stats.json > 0 ? `📋 JSON: ${stats.json}` : "",
        stats.md > 0 ? `📝 Markdown: ${stats.md}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return report;
    } catch (error) {
      safeDebug(
        this.api.logger,
        `${label}分析失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      return label === "工作区"
        ? ResponseMessages.WORKSPACE_ANALYSIS_COMPLETE
        : ResponseMessages.CODEBASE_ANALYSIS_COMPLETE;
    }
  }

  /**
   * 获取缓存的文件列表
   *
   * 使用 TTL 缓存机制避免频繁的文件系统操作。
   *
   * @param dir 目录路径
   * @returns Promise<string[]> 文件名列表
   */
  async getCachedFiles(dir: string): Promise<string[]> {
    if (!this.config.enableCache) {
      return fs.readdir(dir);
    }

    const now = Date.now();
    const cached = this.fileCache.get(dir);

    if (cached && now - cached.timestamp < this.config.cacheTTL) {
      return cached.data;
    }

    const files = await fs.readdir(dir);
    this.fileCache.set(dir, { data: files, timestamp: now });
    return files;
  }

  /**
   * 统计文件类型
   *
   * 遍历文件列表，根据扩展名统计各类型文件的数量。
   *
   * @param files 文件名列表
   * @returns 各类型文件计数
   */
  countFileTypes(files: string[]): FileTypeStats {
    const stats: FileTypeStats = { ts: 0, js: 0, json: 0, md: 0 };
    for (const file of files) {
      if (file.endsWith(FileExtensions.TYPESCRIPT)) stats.ts++;
      else if (file.endsWith(FileExtensions.JAVASCRIPT)) stats.js++;
      else if (file.endsWith(FileExtensions.JSON)) stats.json++;
      else if (file.endsWith(FileExtensions.MARKDOWN)) stats.md++;
    }
    return stats;
  }

  /**
   * 清理过期缓存条目
   *
   * 定期清理 fileCache 中过期的条目，防止内存泄漏。
   */
  cleanExpiredCache(): void {
    const now = Date.now();
    const maxAge = this.config.cacheTTL * 2;
    let cleaned = 0;

    for (const [dir, cached] of this.fileCache.entries()) {
      if (now - cached.timestamp > maxAge) {
        this.fileCache.delete(dir);
        cleaned++;
      }
    }

    if (cleaned > 0 && this.api.logger.debug) {
      this.api.logger.debug(`🧹 清理了 ${cleaned} 个过期缓存条目`);
    }
  }

  /**
   * 格式化分析结果
   *
   * @param result 代码质量报告
   * @returns 格式化的字符串
   */
  private formatAnalysisResult(result: CodeQualityReport): string {
    const totalLines = result.files.reduce((sum, f) => sum + f.linesOfCode, 0);
    const totalFunctions = result.files.reduce(
      (sum, f) => sum + f.functionCount,
      0,
    );

    const lines = [
      `📁 分析文件: ${result.files.length}`,
      `📝 总行数: ${totalLines}`,
      totalFunctions > 0 ? `🔧 函数: ${totalFunctions}` : "",
      `⭐ 质量评分: ${result.overallScore}/100`,
      result.totalIssues > 0 ? `⚠️  总问题: ${result.totalIssues}` : "",
    ].filter(Boolean);

    if (result.totalIssues > 0) {
      lines.push(`\n问题分类:`);
      for (const [type, count] of Object.entries(result.issuesByType)) {
        if (count > 0) {
          lines.push(`  • ${type}: ${count}`);
        }
      }
    }

    if (result.suggestions.length > 0) {
      lines.push(`\n改进建议:`);
      for (const suggestion of result.suggestions) {
        lines.push(`  • ${suggestion}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.fileCache.clear();
  }
}
