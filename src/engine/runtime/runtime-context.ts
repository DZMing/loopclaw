/**
 * 运行时上下文管理模块
 *
 * 负责管理 OpenClaw 宿主上下文，包括 workspaceDir、stateDir 等关键路径。
 *
 * @version 2.48.0
 * @since 2026-03-13
 * @author Claude Code
 */

import type {
  OpenClawPluginServiceContext,
  PluginCommandContext,
} from "../../types.js";

/**
 * 简化的日志接口
 * @internal
 */
export interface EngineLogger {
  /** 记录信息日志 */
  info: (message: string) => void;
  /** 记录警告日志 */
  warn: (message: string) => void;
  /** 记录错误日志 */
  error: (message: string) => void;
  /** 记录调试日志（可选） */
  debug?: (message: string) => void;
}

/**
 * 运行时上下文管理器
 *
 * 提供 OpenClaw 宿主上下文的存储和访问方法。
 */
export class RuntimeContextManager {
  private runtimeContext?: OpenClawPluginServiceContext;

  constructor(private readonly api: { logger: EngineLogger }) {}

  /**
   * 保存运行时上下文
   *
   * @param ctx OpenClaw 插件服务上下文
   * @returns 保存的上下文
   */
  rememberRuntimeContext(
    ctx: OpenClawPluginServiceContext,
  ): OpenClawPluginServiceContext {
    this.runtimeContext = {
      config: structuredClone(ctx.config),
      workspaceDir: ctx.workspaceDir,
      stateDir: ctx.stateDir,
      logger: ctx.logger,
    };
    return this.runtimeContext;
  }

  /**
   * 获取运行时上下文（必须存在）
   *
   * @returns 运行时上下文
   * @throws 如果上下文未初始化
   */
  requireRuntimeContext(): OpenClawPluginServiceContext {
    if (!this.runtimeContext) {
      throw new Error(
        "OpenClaw 宿主上下文缺失，请先通过服务启动或 gateway_start 注入 workspaceDir/stateDir",
      );
    }
    return this.runtimeContext;
  }

  /**
   * 从命令上下文获取运行时上下文
   *
   * 合并命令配置到运行时上下文。
   *
   * @param ctx 命令上下文
   * @returns 合并后的运行时上下文
   */
  getRuntimeContextFromCommand(
    ctx: PluginCommandContext,
  ): OpenClawPluginServiceContext {
    const runtimeContext = this.requireRuntimeContext();
    return {
      ...runtimeContext,
      config: { ...runtimeContext.config, ...ctx.config },
      logger: runtimeContext.logger ?? this.api.logger,
    };
  }

  /**
   * 获取工作目录（必须存在）
   *
   * @param ctx 可选的上下文
   * @returns 工作目录路径
   * @throws 如果工作目录未配置
   */
  requireWorkspaceDir(ctx?: OpenClawPluginServiceContext): string {
    const workspaceDir = ctx?.workspaceDir ?? this.runtimeContext?.workspaceDir;
    if (!workspaceDir) {
      throw new Error("OpenClaw workspaceDir 缺失，拒绝回退到 process.cwd()");
    }
    return workspaceDir;
  }

  /**
   * 获取状态目录（必须存在）
   *
   * @param ctx 可选的上下文
   * @returns 状态目录路径
   * @throws 如果状态目录未配置
   */
  requireStateDir(ctx?: OpenClawPluginServiceContext): string {
    const stateDir = ctx?.stateDir ?? this.runtimeContext?.stateDir;
    if (!stateDir) {
      throw new Error("OpenClaw stateDir 缺失，拒绝回退到临时目录");
    }
    return stateDir;
  }

  /**
   * 获取当前运行时上下文（可选）
   *
   * @returns 运行时上下文，如果未初始化则返回 undefined
   */
  getRuntimeContext(): OpenClawPluginServiceContext | undefined {
    return this.runtimeContext;
  }

  /**
   * 清除运行时上下文
   */
  clearRuntimeContext(): void {
    this.runtimeContext = undefined;
  }
}
