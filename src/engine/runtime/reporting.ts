/**
 * 报告和通知模块
 *
 * 负责引擎运行状态的报告和外部通知。
 *
 * @version 2.48.0
 * @since 2026-03-13
 * @author Claude Code
 */

import fs from "fs/promises";
import path from "path";
import type { OpenClawPluginServiceContext } from "../../types.js";
import type { EngineConfig } from "../../config.js";
import { createNotifier, NotificationChannel } from "../notifier.js";
import { StateFileNames } from "./state-persistence.js";

/** 类型导入 */
import type { EngineLogger } from "./runtime-context.js";

/**
 * 汇报记录数据结构
 */
export interface ReportRecord {
  loop: number;
  action: string;
  result: string;
  timestamp: string;
  running: boolean;
  avgLoopTimeMs: number;
  loopsPerSecond: number;
  contextSize: number;
  errorStats: Record<string, number>;
  reportTarget: EngineConfig["reportTarget"];
  reportChannel?: string;
  llm: {
    provider: EngineConfig["llmProvider"];
    model?: string;
    baseURL?: string;
  };
}

/**
 * 报告管理器
 *
 * 负责生成和发送引擎运行状态报告。
 */
export class ReportingManager {
  constructor(
    private readonly api: { logger: EngineLogger },
    private readonly config: EngineConfig,
  ) {}

  /**
   * 发送汇报
   *
   * 记录当前循环的状态信息，包括：
   * - 循环编号和行动结果
   * - 性能指标（平均时间、速率等）
   * - 上下文大小和错误统计
   *
   * @param ctx 服务上下文
   * @param status 包含循环编号、行动和结果的状态对象
   * @param isRunning 是否正在运行
   * @param avgLoopTimeMs 平均循环时间
   * @param loopsPerSecond 每秒循环次数
   * @param contextSize 上下文大小
   * @param errorStats 错误统计
   * @returns Promise<void>
   */
  async sendReport(
    ctx: OpenClawPluginServiceContext,
    status: { loop: number; action: string; result: string },
    isRunning: boolean,
    avgLoopTimeMs: number,
    loopsPerSecond: number,
    contextSize: number,
    errorStats: Record<string, number>,
  ): Promise<void> {
    const reportRecord: ReportRecord = {
      ...status,
      timestamp: new Date().toISOString(),
      running: isRunning,
      avgLoopTimeMs,
      loopsPerSecond,
      contextSize,
      errorStats,
      reportTarget: this.config.reportTarget,
      reportChannel: this.config.reportChannel,
      llm: {
        provider: this.config.llmProvider,
        model: this.config.llmModel,
        baseURL: this.config.llmBaseURL,
      },
    };

    // 持久化报告到文件（如果不是 log 模式）
    if (this.config.reportTarget !== "log") {
      try {
        await fs.mkdir(ctx.stateDir, { recursive: true });

        const latestReportPath = path.join(
          ctx.stateDir,
          StateFileNames.LATEST_REPORT,
        );
        const latestTmpPath = latestReportPath + StateFileNames.TEMP_SUFFIX;
        const historyPath = path.join(
          ctx.stateDir,
          StateFileNames.REPORT_HISTORY,
        );

        await fs.writeFile(
          latestTmpPath,
          JSON.stringify(reportRecord, null, 2),
          "utf-8",
        );
        await fs.rename(latestTmpPath, latestReportPath);
        await fs.appendFile(
          historyPath,
          JSON.stringify(reportRecord) + "\n",
          "utf-8",
        );
      } catch (error) {
        this.api.logger.warn(
          `汇报落盘失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // 发送外部报告（Discord/Telegram）
    await this.sendExternalReport(reportRecord);

    // 记录到日志
    this.api.logger.info(
      `📤 [循环 ${status.loop}] ${status.action} → ${status.result}`,
    );
  }

  /**
   * 发送外部报告
   *
   * 通过 Discord 或 Telegram 发送报告通知。
   *
   * @param reportRecord 汇报记录
   * @returns Promise<void>
   */
  private async sendExternalReport(reportRecord: ReportRecord): Promise<void> {
    if (
      reportRecord.reportTarget !== "discord" &&
      reportRecord.reportTarget !== "telegram"
    ) {
      return;
    }

    if (!reportRecord.reportChannel) {
      this.api.logger.warn(
        `外部汇报已启用但 reportChannel 缺失: ${reportRecord.reportTarget}`,
      );
      return;
    }

    try {
      const notifier =
        reportRecord.reportTarget === "discord"
          ? createNotifier({
              enabled: true,
              enabledChannels: [NotificationChannel.DISCORD],
              discord: {
                webhookUrl: reportRecord.reportChannel,
              },
            })
          : (() => {
              // 优先使用配置中的 bot token，回退到环境变量
              const botToken =
                this.config.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN;
              if (!botToken) {
                throw new Error(
                  "TELEGRAM_BOT_TOKEN 缺失（需通过配置 telegramBotToken 或环境变量提供）",
                );
              }
              return createNotifier({
                enabled: true,
                enabledChannels: [NotificationChannel.TELEGRAM],
                telegram: {
                  botToken,
                  chatId: reportRecord.reportChannel!,
                },
              });
            })();

      await notifier.info(
        `龙虾引擎循环 ${reportRecord.loop}`,
        `${reportRecord.action} -> ${reportRecord.result}\n` +
          `provider=${reportRecord.llm.provider}, model=${reportRecord.llm.model ?? "n/a"}`,
      );
    } catch (error) {
      this.api.logger.warn(
        `外部汇报失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 写入建议日志
   *
   * 将 AI 生成的建议写入日志文件。
   *
   * @param ctx 服务上下文
   * @param suggestion 建议内容
   * @returns Promise<void>
   */
  async writeSuggestionLog(
    ctx: OpenClawPluginServiceContext,
    suggestion: string,
  ): Promise<void> {
    try {
      const logPath = path.join(ctx.stateDir, StateFileNames.SUGGESTIONS_LOG);
      const timestamp = new Date().toISOString();
      await fs.mkdir(ctx.stateDir, { recursive: true });
      await fs.appendFile(logPath, `[${timestamp}] ${suggestion}\n`);
    } catch {
      // 静默失败，不影响主循环
    }
  }
}
