/**
 * 状态持久化模块
 *
 * 负责引擎状态的持久化和恢复，包括循环计数、上下文数据等。
 *
 * @version 2.48.0
 * @since 2026-03-13
 * @author Claude Code
 */

import fs from "fs/promises";
import path from "path";
import type { OpenClawPluginServiceContext } from "../../types.js";

/** 类型导入 */
import type { EngineLogger } from "./runtime-context.js";

/**
 * 状态文件名常量
 * @internal
 */
export const StateFileNames = {
  /** 引擎状态文件 */
  ENGINE_STATE: "engine-state.json",
  /** 状态存储目录 */
  STATE_DIR: ".lobster-engine",
  /** 建议日志文件 */
  SUGGESTIONS_LOG: "suggestions.log",
  /** 临时文件后缀 */
  TEMP_SUFFIX: ".tmp",
  /** 最新报告文件 */
  LATEST_REPORT: "latest-report.json",
  /** 报告历史文件 */
  REPORT_HISTORY: "report-history.jsonl",
} as const;

/**
 * 日志消息常量
 * @internal
 */
const LogMessages = {
  /** 引擎启动完成 */
  ENGINE_STARTED: "🦞 永动循环已启动（后台运行）",
  /** 引擎已停止 */
  ENGINE_STOPPED: "🛑 永动循环已停止",
  /** 引擎就绪，等待启动命令 */
  ENGINE_READY: "🦞 引擎已就绪，等待启动命令",
  /** 状态已恢复 */
  STATUS_RECOVERED: (loop: number) => `📦 状态已恢复: 第 ${loop} 循环`,
  /** 状态已持久化 */
  STATE_PERSISTED: (loop: number) => `💾 状态已持久化: 第 ${loop} 循环`,
  /** 无状态文件 */
  NO_STATE_FILE: "💡 首次启动，无状态文件",
  /** 上下文已压缩 */
  CONTEXT_COMPRESSED: (actions: number, errors: number) =>
    `🗜️ 上下文已压缩: ${actions} 行动, ${errors} 错误`,
  /** 健康检查检测到卡死 */
  HEALTH_CHECK_STALL: (seconds: number) => `⚠️ 循环已卡死 ${seconds} 秒`,
} as const;

/**
 * 引擎状态数据结构
 */
export interface EngineState {
  /** 是否正在运行 */
  isRunning: boolean;
  /** 循环计数 */
  loopCount: number;
  /** 上下文数据 */
  context: {
    /** 行动记录 */
    actions: Array<{
      loop: number;
      action: string;
      result: string;
      timestamp: number;
    }>;
    /** 错误记录 */
    errors: Array<{
      loop: number;
      category: string;
      message: string;
      timestamp: number;
    }>;
  };
  /** 最后更新时间 */
  lastUpdate: string;
  /** 版本号 */
  version: string;
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
 * 状态持久化管理器
 *
 * 负责引擎状态的读取、写入和恢复操作。
 */
export class StatePersistenceManager {
  private loopCountValue = 0;
  private context: EngineState["context"] = {
    actions: [],
    errors: [],
  };

  constructor(private readonly api: { logger: EngineLogger }) {}

  /**
   * 获取循环计数
   */
  getLoopCount(): number {
    return this.loopCountValue;
  }

  /**
   * 设置循环计数
   */
  setLoopCount(value: number): void {
    this.loopCountValue = value;
  }

  /**
   * 增加循环计数
   */
  incrementLoopCount(): void {
    this.loopCountValue++;
  }

  /**
   * 获取上下文
   */
  getContext(): EngineState["context"] {
    return this.context;
  }

  /**
   * 设置上下文
   */
  setContext(context: EngineState["context"]): void {
    this.context = context;
  }

  /**
   * 从磁盘恢复状态
   *
   * @param ctx 服务上下文
   * @returns Promise<void>
   */
  async recoverState(ctx: OpenClawPluginServiceContext): Promise<void> {
    const statePath = path.join(ctx.stateDir, StateFileNames.ENGINE_STATE);
    try {
      await fs.access(statePath);
    } catch {
      safeDebug(this.api.logger, LogMessages.NO_STATE_FILE);
      return;
    }

    try {
      const data = await fs.readFile(statePath, "utf-8");
      const state = JSON.parse(data) as EngineState;

      // 验证状态文件格式
      if (typeof state.loopCount === "number" && state.loopCount > 0) {
        this.loopCountValue = state.loopCount;
        this.api.logger.info(LogMessages.STATUS_RECOVERED(state.loopCount));
      }

      // 恢复上下文（验证格式）
      if (state.context && Array.isArray(state.context.actions)) {
        this.context = {
          actions: state.context.actions || [],
          errors: state.context.errors || [],
        };
        safeDebug(
          this.api.logger,
          `📦 恢复上下文: ${this.context.actions.length} 行动, ${this.context.errors.length} 错误`,
        );
      }

      if (state.lastUpdate) {
        safeDebug(this.api.logger, `🕒 最后更新: ${state.lastUpdate}`);
      }
    } catch (error) {
      this.api.logger.warn(
        `状态恢复失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 持久化状态到磁盘
   *
   * @param ctx 服务上下文
   * @returns Promise<void>
   */
  async persistState(ctx: OpenClawPluginServiceContext): Promise<void> {
    const statePath = path.join(ctx.stateDir, StateFileNames.ENGINE_STATE);
    const tmpPath = statePath + StateFileNames.TEMP_SUFFIX;

    try {
      await fs.mkdir(ctx.stateDir, { recursive: true });

      const stateData = JSON.stringify(
        {
          isRunning: false, // 停止时总是 false
          loopCount: this.loopCountValue,
          context: this.context,
          lastUpdate: new Date().toISOString(),
          version: "1.0.0",
        },
        null,
        2,
      );

      // 先写入临时文件，然后原子性重命名（防止写入中断导致损坏）
      await fs.writeFile(tmpPath, stateData, "utf-8");
      await fs.rename(tmpPath, statePath);

      safeDebug(
        this.api.logger,
        LogMessages.STATE_PERSISTED(this.loopCountValue),
      );
    } catch (error) {
      this.api.logger.warn(
        `状态持久化失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      // 清理临时文件
      try {
        await fs.unlink(tmpPath).catch(() => {});
      } catch {}
    }
  }

  /**
   * 压缩上下文
   *
   * 保留最近的行动和错误记录，删除旧数据以控制内存使用。
   *
   * @param maxActions 最大行动记录数
   * @param maxErrors 最大错误记录数
   */
  compressContext(maxActions: number, maxErrors: number): void {
    const { actions, errors } = this.context;

    if (actions.length > maxActions) {
      this.context.actions = actions.slice(-maxActions);
    }
    if (errors.length > maxErrors) {
      this.context.errors = errors.slice(-maxErrors);
    }
    safeDebug(
      this.api.logger,
      LogMessages.CONTEXT_COMPRESSED(
        this.context.actions.length,
        this.context.errors.length,
      ),
    );
  }

  /**
   * 添加行动记录
   */
  addAction(action: {
    loop: number;
    action: string;
    result: string;
    timestamp: number;
  }): void {
    this.context.actions.push(action);
  }

  /**
   * 添加错误记录
   */
  addError(error: {
    loop: number;
    category: string;
    message: string;
    timestamp: number;
  }): void {
    this.context.errors.push(error);
  }

  /**
   * 获取上下文大小
   */
  getContextSize(): number {
    return JSON.stringify(this.context).length;
  }

  /**
   * 检查是否有最近的错误（5分钟内）
   */
  hasRecentErrors(): boolean {
    const errors = this.context.errors;
    if (errors.length === 0) return false;
    const lastError = errors[errors.length - 1];
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return lastError.timestamp > fiveMinutesAgo;
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const error of this.context.errors) {
      stats[error.category] = (stats[error.category] || 0) + 1;
    }
    return stats;
  }
}
