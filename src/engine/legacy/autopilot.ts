/**
 * 🤖 Autopilot 自主控制器
 *
 * 整合 UltraThink + Ralph Loop 的双引擎自主系统
 *
 * 工作流程：
 * 1. UltraThink 深度分析问题
 * 2. Ralph Loop 执行 6 阶段修复
 * 3. 循环迭代直到成功
 * 4. 记录完整思考路径
 *
 * @version 2.40.0
 * @since 2025-03-11
 */

import {
  UltraThinkEngine,
  DEFAULT_ULTRATHINK_CONFIG,
  type UltraThinkConfig,
} from "./ultrathink.js";
import {
  RalphLoopEngine,
  DEFAULT_RALPH_CONFIG,
  type RalphLoopConfig,
  FixStrategy,
} from "./ralph-loop.js";

// ========== 类型定义 ==========

/**
 * Autopilot 状态
 */
export enum AutopilotState {
  /** 空闲 */
  IDLE = "idle",
  /** 思考中 */
  THINKING = "thinking",
  /** 修复中 */
  FIXING = "fixing",
  /** 验证中 */
  VERIFYING = "verifying",
  /** 已完成 */
  COMPLETED = "completed",
  /** 已失败 */
  FAILED = "failed",
  /** 等待人工 */
  WAITING_MANUAL = "waiting_manual",
}

/**
 * Autopilot 配置
 */
export interface AutopilotConfig {
  /** UltraThink 配置 */
  ultraThink?: Partial<UltraThinkConfig>;
  /** Ralph Loop 配置 */
  ralphLoop?: Partial<RalphLoopConfig>;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 是否启用详细日志 */
  verbose: boolean;
  /** 超时时间（毫秒） */
  timeout: number;
}

/** 默认配置 */
export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  maxIterations: 10,
  verbose: true,
  timeout: 600000, // 10分钟
};

/**
 * Autopilot 会话记录
 */
export interface AutopilotSession {
  /** 会话 ID */
  sessionId: string;
  /** 问题描述 */
  problem: string;
  /** 当前状态 */
  state: AutopilotState;
  /** 当前迭代次数 */
  currentIteration: number;
  /** UltraThink 结果 */
  thinkResult?: {
    conclusion: string;
    confidence: number;
    path: Array<{
      type: string;
      content: string;
      confidence: number;
    }>;
    reasoning: string;
  };
  /** Ralph Loop 尝试记录 */
  ralphAttempts: Array<{
    attemptNumber: number;
    strategy: FixStrategy;
    success: boolean;
    summary: string;
  }>;
  /** 最终结果 */
  finalResult?: {
    success: boolean;
    solution: string;
    iterations: number;
  };
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 错误信息 */
  error?: string;
}

// ========== Autopilot 控制器 ==========

/**
 * Autopilot 自主控制器
 *
 * 双引擎架构：
 * - UltraThink: 深度推理引擎，负责问题分析和策略制定
 * - Ralph Loop: 6阶段修复引擎，负责具体执行和验证
 */
export class AutopilotController {
  private ultraThink: UltraThinkEngine;
  private ralphLoop: RalphLoopEngine;
  private config: AutopilotConfig;
  private currentSession: AutopilotSession | null = null;
  private sessionIdCounter = 0;

  constructor(config?: Partial<AutopilotConfig>) {
    this.config = {
      ...DEFAULT_AUTOPILOT_CONFIG,
      ...config,
      ultraThink: { ...DEFAULT_ULTRATHINK_CONFIG, ...config?.ultraThink },
      ralphLoop: { ...DEFAULT_RALPH_CONFIG, ...config?.ralphLoop },
    };

    this.ultraThink = new UltraThinkEngine(this.config.ultraThink);
    this.ralphLoop = new RalphLoopEngine(this.config.ralphLoop);
  }

  /**
   * 启动自主修复流程
   */
  async execute(problem: string): Promise<AutopilotSession> {
    const sessionId = this.generateSessionId();
    const startTime = Date.now();

    this.currentSession = {
      sessionId,
      problem,
      state: AutopilotState.THINKING,
      currentIteration: 0,
      ralphAttempts: [],
      startTime,
    };

    this.log(`🤖 Autopilot 启动 [${sessionId}]`);
    this.log(`📋 问题: ${problem}`);

    try {
      // 第一阶段：深度思考分析
      this.log(`🧠 阶段1: UltraThink 深度分析...`);
      const thinkResult = await this.ultraThink.think(problem);

      this.currentSession.thinkResult = thinkResult;
      this.log(`💭 思考结论: ${thinkResult.conclusion}`);
      this.log(`📊 置信度: ${(thinkResult.confidence * 100).toFixed(1)}%`);

      // 第二阶段：Ralph Loop 迭代修复
      this.currentSession.state = AutopilotState.FIXING;
      this.log(`🔄 阶段2: Ralph Loop 迭代修复...`);

      const ralphResult = await this.ralphLoop.execute(
        problem,
        async (attempt, strategy) => {
          this.currentSession!.currentIteration = attempt;
          this.log(
            `  📍 尝试 ${attempt}/${this.config.maxIterations} (策略: ${strategy})`,
          );

          // 根据 UltraThink 的分析结果调整修复策略
          const enhancedPrompt = this.buildEnhancedPrompt(
            problem,
            thinkResult,
            attempt,
            strategy,
          );

          // 这里可以集成实际的修复逻辑
          // 目前返回模拟结果
          await this.simulateFix(enhancedPrompt);

          // 模拟验证结果：第3次尝试成功，之前都失败
          const shouldSucceed = attempt >= 3;
          if (!shouldSucceed) {
            throw new Error(`修复尝试 ${attempt} 失败`);
          }
        },
      );

      // 记录 Ralph Loop 结果
      this.currentSession.ralphAttempts = ralphResult.attempts.map((att) => ({
        attemptNumber: att.attemptNumber,
        strategy: att.strategy,
        success: att.status === "success",
        summary: att.error || "成功",
      }));

      // 第三阶段：总结结果
      this.currentSession.state = ralphResult.success
        ? AutopilotState.COMPLETED
        : AutopilotState.WAITING_MANUAL;

      this.currentSession.finalResult = {
        success: ralphResult.success,
        solution: ralphResult.summary,
        iterations: ralphResult.attempts.length,
      };
      this.currentSession.endTime = Date.now();

      this.log(
        ralphResult.success
          ? `✅ Autopilot 成功! 用时: ${this.formatDuration(startTime)}`
          : `⚠️ Autopilot 需要人工介入 - 用时: ${this.formatDuration(startTime)}`,
      );

      return this.currentSession;
    } catch (error) {
      this.currentSession.state = AutopilotState.FAILED;
      this.currentSession.error =
        error instanceof Error ? error.message : String(error);
      this.currentSession.endTime = Date.now();

      this.log(`❌ Autopilot 失败: ${this.currentSession.error}`);
      return this.currentSession;
    }
  }

  /**
   * 获取当前会话状态
   */
  getSession(): AutopilotSession | null {
    return this.currentSession;
  }

  /**
   * 获取思考路径
   */
  getThoughtPath(): Array<{
    type: string;
    content: string;
    confidence: number;
  }> {
    if (!this.currentSession?.thinkResult) {
      return [];
    }
    return this.currentSession.thinkResult.path;
  }

  /**
   * 获取修复历史
   */
  getFixHistory(): Array<{
    attempt: number;
    strategy: string;
    success: boolean;
    summary: string;
  }> {
    if (!this.currentSession) {
      return [];
    }
    return this.currentSession.ralphAttempts.map((att) => ({
      attempt: att.attemptNumber,
      strategy: att.strategy,
      success: att.success,
      summary: att.summary,
    }));
  }

  // ========== 私有方法 ==========

  /**
   * 生成增强提示词（整合 UltraThink 分析结果）
   */
  private buildEnhancedPrompt(
    problem: string,
    thinkResult: { conclusion: string; reasoning: string },
    attempt: number,
    strategy: FixStrategy,
  ): string {
    return `
问题: ${problem}

=== UltraThink 深度分析 ===
思考结论: ${thinkResult.conclusion}

推理过程:
${thinkResult.reasoning}

=== Ralph Loop 第 ${attempt} 次尝试 ===
策略: ${strategy}

请基于以上分析执行修复操作。
`.trim();
  }

  /**
   * 模拟修复过程（实际应集成到具体系统）
   */
  private async simulateFix(prompt: string): Promise<void> {
    // 这里应该调用实际的修复逻辑
    // 例如：调用代码编辑器、API、服务等
    this.log(`    🔧 执行修复: ${prompt.slice(0, 50)}...`);
    await new Promise((resolve) => setTimeout(resolve, 100)); // 模拟延迟
  }

  /**
   * 格式化持续时间
   */
  private formatDuration(startTime: number): string {
    const duration = Date.now() - startTime;
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}分${remainingSeconds}秒`;
    }
    return `${seconds}秒`;
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `ap-${Date.now()}-${++this.sessionIdCounter}`;
  }

  /**
   * 日志输出
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[Autopilot] ${message}`);
    }
  }
}

// ========== 工厂函数 ==========

/**
 * 创建 Autopilot 控制器
 */
export function createAutopilot(
  config?: Partial<AutopilotConfig>,
): AutopilotController {
  return new AutopilotController(config);
}

/**
 * 快速执行（使用默认配置）
 */
export async function quickAutopilot(
  problem: string,
): Promise<AutopilotSession> {
  const autopilot = createAutopilot();
  return await autopilot.execute(problem);
}
