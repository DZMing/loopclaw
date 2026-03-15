/**
 * MISSION/BOUNDARIES 文件操作模块
 *
 * 负责读取、解析和更新 MISSION 和 BOUNDARIES 文件。
 *
 * @version 2.48.0
 * @since 2026-03-13
 * @author Claude Code
 */

import fs from "fs/promises";
import path from "path";
import type { OpenClawPluginServiceContext } from "../../types.js";
import type { EngineConfig } from "../../config.js";

/** 类型导入 */
import type { EngineLogger } from "./runtime-context.js";

/**
 * MISSION 文件名常量
 * @internal
 */
export const MissionFileNames = {
  /** 任务描述文件 */
  MISSION: "MISSION_PARTNER.md",
  /** 权限边界文件 */
  BOUNDARIES: "BOUNDARIES_PARTNER.md",
} as const;

/**
 * 默认维护行动列表
 * @internal
 */
const DEFAULT_MAINTENANCE_ACTIONS = [
  "分析工作区文件结构",
  "检查代码质量",
  "生成优化建议",
  "验证配置完整性",
  "更新运行状态",
] as const;

/**
 * 错误分类枚举
 */
export enum ErrorCategory {
  UNKNOWN = "unknown",
  FILE_IO = "file_io",
  PARSE = "parse",
  NETWORK = "network",
  PERMISSION = "permission",
  TIMEOUT = "timeout",
}

/**
 * 错误恢复策略消息
 */
const RecoveryMessages: Record<ErrorCategory, string> = {
  [ErrorCategory.FILE_IO]: "重试文件操作，检查文件路径权限",
  [ErrorCategory.PARSE]: "验证数据格式，使用默认值继续",
  [ErrorCategory.NETWORK]: "切换到离线模式，使用缓存数据",
  [ErrorCategory.PERMISSION]: "降级操作，使用只读模式",
  [ErrorCategory.TIMEOUT]: "增加超时时间，简化操作",
  [ErrorCategory.UNKNOWN]: "记录错误，跳过当前操作",
};

/**
 * MISSION 缓存
 */
interface MissionCache {
  workspaceDir: string;
  timestamp: number;
  mission: string;
  boundaries: string;
}

/**
 * 错误记录
 */
export interface ErrorRecord {
  loop: number;
  error: string;
  timestamp: number;
  category?: string;
  resolved?: boolean;
  recoveryAttemptedAt?: number;
}

/**
 * MISSION 管理器
 *
 * 负责加载、解析和更新 MISSION/BOUNDARIES 文件。
 */
export class MissionManager {
  private missionCache?: MissionCache;

  constructor(
    private readonly api: { logger: EngineLogger },
    private readonly config: EngineConfig,
  ) {}

  /**
   * 加载 MISSION 和 BOUNDARIES 文件
   *
   * @param ctx 服务上下文
   * @param workspaceDir 工作目录
   * @param enableCache 是否启用缓存
   * @param cacheTTL 缓存生存时间
   * @returns Promise 包含 MISSION 和 BOUNDARIES 内容
   */
  async loadMissionFiles(
    ctx: OpenClawPluginServiceContext,
    workspaceDir: string,
    enableCache: boolean,
    cacheTTL: number,
  ): Promise<{ mission: string; boundaries: string }> {
    const missionPath = path.join(workspaceDir, MissionFileNames.MISSION);
    const boundariesPath = path.join(workspaceDir, MissionFileNames.BOUNDARIES);
    const now = Date.now();

    // 检查缓存
    if (
      enableCache &&
      this.missionCache &&
      this.missionCache.workspaceDir === workspaceDir &&
      now - this.missionCache.timestamp < cacheTTL
    ) {
      return {
        mission: this.missionCache.mission,
        boundaries: this.missionCache.boundaries,
      };
    }

    try {
      const [mission, boundaries] = await Promise.all([
        fs.readFile(missionPath, "utf-8").catch(() => this.getDefaultMission()),
        fs
          .readFile(boundariesPath, "utf-8")
          .catch(() => this.getDefaultBoundaries()),
      ]);

      if (enableCache) {
        this.missionCache = {
          workspaceDir,
          timestamp: now,
          mission,
          boundaries,
        };
      }

      return { mission, boundaries };
    } catch (error) {
      this.api.logger.warn("无法加载 MISSION/BOUNDARIES，使用默认值");
      const fallback = {
        mission: this.getDefaultMission(),
        boundaries: this.getDefaultBoundaries(),
      };
      if (enableCache) {
        this.missionCache = {
          workspaceDir,
          timestamp: now,
          ...fallback,
        };
      }
      return fallback;
    }
  }

  /**
   * 读取 MISSION 文件内容
   *
   * @param workspaceDir 工作目录
   * @returns Promise 包含 mission 内容、是否存在和路径
   */
  async readMission(workspaceDir: string): Promise<{
    mission: string;
    exists: boolean;
    path: string;
  }> {
    try {
      const missionPath = path.join(workspaceDir, MissionFileNames.MISSION);
      const content = await fs.readFile(missionPath, "utf-8");
      return {
        mission: content,
        exists: true,
        path: missionPath,
      };
    } catch {
      return {
        mission: this.getDefaultMission(),
        exists: false,
        path: path.join(workspaceDir, MissionFileNames.MISSION),
      };
    }
  }

  /**
   * 更新 MISSION 文件
   *
   * @param workspaceDir 工作目录
   * @param missionContent 新的 MISSION 内容
   * @returns Promise<{ success: boolean; path: string; message: string }>
   */
  async updateMission(
    workspaceDir: string,
    missionContent: string,
  ): Promise<{
    success: boolean;
    path: string;
    message: string;
  }> {
    const missionPath = path.join(workspaceDir, MissionFileNames.MISSION);

    try {
      // 读取现有文件或使用默认模板
      let existingContent = "";
      try {
        existingContent = await fs.readFile(missionPath, "utf-8");
      } catch {
        // 文件不存在，使用默认模板
        existingContent = this.getDefaultMission();
      }

      // 更新核心目标部分
      const lines = existingContent.split("\n");
      const updatedLines: string[] = [];
      let inCoreSection = false;
      let skippedFirstHeader = false;

      for (const line of lines) {
        if (line.startsWith("## 核心目标") || line.startsWith("# 核心目标")) {
          inCoreSection = true;
          updatedLines.push(line);
          continue;
        }

        if (inCoreSection && line.startsWith("## ")) {
          inCoreSection = false;
          updatedLines.push(line);
          continue;
        }

        if (inCoreSection && !skippedFirstHeader) {
          updatedLines.push(missionContent);
          updatedLines.push("");
          skippedFirstHeader = true;
        } else if (!inCoreSection || skippedFirstHeader) {
          updatedLines.push(line);
        }
      }

      // 如果没找到核心目标部分，追加到文件末尾
      if (!skippedFirstHeader) {
        updatedLines.push("\n" + missionContent);
      }

      await fs.writeFile(missionPath, updatedLines.join("\n"), "utf-8");

      return {
        success: true,
        path: missionPath,
        message: `✅ 更新成功: ${missionPath}`,
      };
    } catch (error) {
      return {
        success: false,
        path: missionPath,
        message: `❌ 更新失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 解析 MISSION 文件获取行动列表
   *
   * @param mission MISSION 文件内容
   * @returns 解析出的任务列表
   */
  parseMissionActions(mission: string): string[] {
    const actions: string[] = [];
    const lines = mission.split("\n");
    let inTasksSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // 检测任务开始标记
      if (
        trimmed.startsWith("## 具体任务") ||
        trimmed.startsWith("# 具体任务")
      ) {
        inTasksSection = true;
        continue;
      }

      // 检测下一个章节开始，任务结束
      if (inTasksSection && trimmed.startsWith("##")) {
        break;
      }

      // 解析任务行
      if (inTasksSection && trimmed) {
        // 匹配 "数字. 描述" 格式
        const taskMatch = trimmed.match(/^(\d+)\.\s*(.+)$/);
        if (taskMatch) {
          actions.push(taskMatch[2]);
        }
      }
    }

    return actions;
  }

  /**
   * 生成下一步行动
   *
   * 决策优先级：
   * 1. 未解决的错误 → 错误恢复行动
   * 2. 首次循环 → 初始化
   * 3. MISSION 任务 → 解析的任务列表
   * 4. 默认维护 → 预定义维护任务
   *
   * @param mission MISSION 文件内容
   * @param loopCount 当前循环计数
   * @param context 上下文（包含错误记录）
   * @returns Promise 包含行动描述和类型
   */
  async planNextAction(
    mission: string,
    loopCount: number,
    context: { errors: ErrorRecord[] },
  ): Promise<{
    description: string;
    type: string;
    recoveryErrorTimestamp?: number;
  }> {
    // 优先级1：处理未解决的错误
    const unresolvedErrors = context.errors.filter(
      (error) => !error.resolved && error.recoveryAttemptedAt === undefined,
    );
    if (unresolvedErrors.length > 0) {
      const lastError = unresolvedErrors[unresolvedErrors.length - 1];
      const recovery = this.getErrorRecoveryAction(lastError);

      return {
        description: recovery.description,
        type: "error_recovery",
        recoveryErrorTimestamp: lastError.timestamp,
      };
    }

    // 优先级2：初始化
    if (loopCount === 0) {
      return {
        description: "初始化引擎，加载配置和状态",
        type: "init",
      };
    }

    // 优先级3：根据 MISSION 生成行动
    const actions = this.parseMissionActions(mission);

    // 优先级4：默认维护行动
    const selectedActions =
      actions.length > 0 ? actions : [...DEFAULT_MAINTENANCE_ACTIONS];
    return {
      description: selectedActions[loopCount % selectedActions.length],
      type: "execute",
    };
  }

  /**
   * 根据错误类型生成恢复行动
   *
   * @param error 错误记录
   * @returns 恢复行动描述
   */
  getErrorRecoveryAction(error: ErrorRecord): {
    description: string;
  } {
    const category = error.category || ErrorCategory.UNKNOWN;
    const message =
      RecoveryMessages[category as keyof typeof RecoveryMessages] ??
      RecoveryMessages[ErrorCategory.UNKNOWN];

    // UNKNOWN 类型需要包含错误详情
    if (category === ErrorCategory.UNKNOWN) {
      return { description: `${message}: ${error.error.slice(0, 30)}...` };
    }

    return { description: message };
  }

  /**
   * 获取默认 MISSION 内容
   */
  getDefaultMission(): string {
    return `# MISSION - 龙虾永动引擎

## 核心目标
持续学习和优化，为用户提供最佳协助

## 具体任务
1. 监控工作区状态
2. 识别可优化的地方
3. 生成改进建议

## 成功指标
- 用户满意度
- 任务完成率
`;
  }

  /**
   * 获取默认 BOUNDARIES 内容
   */
  getDefaultBoundaries(): string {
    return `# BOUNDARIES - 安全边界

## 绝对禁止
- ❌ 删除用户文件
- ❌ 执行危险命令
- ❌ 修改核心配置

## 允许的操作
- ✅ 读取和分析数据
- ✅ 生成报告
- ✅ 发送状态更新
`;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.missionCache = undefined;
  }
}
