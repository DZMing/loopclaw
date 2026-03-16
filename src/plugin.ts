/**
 * 🦞 龙虾永动引擎 - OpenClaw 插件
 *
 * 核心特性：
 * - 零延迟 while(isRunning) 死循环
 * - 狂暴异常处理（错误→提示词→继续）
 * - /start_partner 和 /stop_partner 命令
 */

import type {
  OpenClawPluginApi,
  OpenClawPluginServiceContext,
} from "./types.js";
import { PerpetualEngineService } from "./engine/service.js";
import { loadConfig } from "./config.js";

// v2.48: 插件版本常量
const PLUGIN_VERSION = "v2.50.0";

export default function register(api: OpenClawPluginApi) {
  const logger = api.logger;
  // api.config 是整个 openclaw.json 根对象，api.pluginConfig 才是插件专属配置
  const config = loadConfig(
    api.pluginConfig as Record<string, unknown> | undefined,
  );
  const engineService = new PerpetualEngineService(api, config);

  logger.info(
    `🦞 龙虾永动引擎配置加载: ` +
      `压缩间隔=${config.compressInterval}, ` +
      `健康检查=${config.enableHealthCheck}`,
  );

  // v2.48: 共享状态获取函数 - 消除重复代码
  const HEALTH_THRESHOLD_MB = 500; // 健康检查内存阈值（魔法数字常量化）

  // v2.48: 权限检查辅助函数 - 消除重复逻辑
  function checkAuth(
    ctx: { isAuthorizedSender: boolean; senderId?: string },
    action: string,
  ): { authorized: boolean; response?: { text: string } } {
    if (!ctx.isAuthorizedSender) {
      logger.warn(`🚫 未授权用户尝试${action}: ${ctx.senderId || "unknown"}`);
      return {
        authorized: false,
        response: { text: `❌ 权限不足：只有授权用户才能${action}` },
      };
    }
    return { authorized: true };
  }

  function isEnabled(value: unknown): boolean {
    if (value === true) {
      return true;
    }

    if (typeof value === "string") {
      return value.trim().toLowerCase() === "true";
    }

    return false;
  }

  function getEngineStatus() {
    const avgTime = engineService.getAvgLoopTime();
    const loopsPerSec = engineService.getLoopsPerSecond();
    const memory = engineService.getMemoryUsage();
    const errorStats = engineService.getErrorStats();
    const errorStatsText =
      Object.entries(errorStats)
        .map(([cat, count]) => `${cat}: ${count}`)
        .join(", ") || "无";

    return {
      version: PLUGIN_VERSION,
      running: engineService.isRunning(),
      loopCount: engineService.getLoopCount(),
      avgLoopTimeMs: avgTime,
      loopsPerSecond: loopsPerSec,
      memoryUsageMB: memory,
      errorStats,
      errorStatsText,
      contextSize: engineService.getContextSize(),
      isHealthy: memory < HEALTH_THRESHOLD_MB,
      timestamp: new Date().toISOString(),
    };
  }

  function formatStatusText(status: ReturnType<typeof getEngineStatus>) {
    return (
      "🦞 永动引擎状态\n\n" +
      "运行中: " +
      (status.running ? "是" : "否") +
      "\n" +
      "循环次数: " +
      status.loopCount +
      "\n" +
      "平均耗时: " +
      status.avgLoopTimeMs +
      "ms\n" +
      "循环速率: " +
      status.loopsPerSecond +
      " 循环/秒\n" +
      "内存使用: " +
      status.memoryUsageMB +
      " MB\n" +
      "错误统计: " +
      status.errorStatsText +
      "\n" +
      "上下文大小: " +
      status.contextSize +
      " 字符"
    );
  }

  // 注册后台服务
  api.registerService({
    id: "lobster-perpetual-engine",
    start: (ctx) => {
      logger.info("🦞 龙虾永动引擎服务启动");
      engineService.start(ctx);
    },
    stop: (ctx) => {
      logger.info("🦞 龙虾永动引擎服务停止");
      engineService.stopService(ctx);
    },
  });

  // 注册 /start_partner 命令
  api.registerCommand({
    name: "start_partner",
    description: "启动零延迟永动循环引擎",
    handler: async (ctx) => {
      // v2.48: 使用统一权限检查
      const authCheck = checkAuth(ctx, "启动引擎");
      if (!authCheck.authorized) {
        return authCheck.response!;
      }

      logger.info(
        `🚀 收到启动命令 (用户: ${ctx.senderId || "unknown"}, 频道: ${ctx.channel})`,
      );
      await engineService.startFromCommand(ctx);

      return {
        text:
          "🦞 永动引擎已启动\n\n" +
          "状态: " +
          (engineService.isRunning() ? "运行中" : "启动中...") +
          "\n" +
          "循环次数: " +
          engineService.getLoopCount() +
          "\n\n" +
          "使用 /stop_partner 停止引擎",
      };
    },
  });

  // 注册 /stop_partner 命令
  api.registerCommand({
    name: "stop_partner",
    description: "停止永动循环引擎",
    handler: async (ctx) => {
      // v2.48: 使用统一权限检查
      const authCheck = checkAuth(ctx, "停止引擎");
      if (!authCheck.authorized) {
        return authCheck.response!;
      }

      logger.info(`🛑 收到停止命令 (用户: ${ctx.senderId || "unknown"})`);
      await engineService.stopLoop();

      return {
        text:
          "🛑 永动引擎已停止\n\n" +
          "总循环次数: " +
          engineService.getLoopCount() +
          "\n" +
          "使用 /start_partner 重新启动",
      };
    },
  });

  // 注册 /partner_status 命令
  api.registerCommand({
    name: "partner_status",
    description: "查看永动引擎状态",
    handler: async () => {
      const status = getEngineStatus();
      return { text: formatStatusText(status) };
    },
  });

  // 🔥 新增：/partner_mission 命令 - 设置任务目标
  api.registerCommand({
    name: "partner_mission",
    description: "设置或查看永动引擎的任务目标（MISSION）",
    acceptsArgs: true, // v2.48: 声明接受参数
    handler: async (ctx) => {
      // v2.48: 优先使用 commandBody 获取完整命令文本
      const input = (ctx.commandBody || ctx.args || "").trim();

      // v2.47: 无参数时显示当前任务目标
      if (!input) {
        const { mission, exists } = await engineService.readMission();
        const lines = mission.split("\n");
        const coreGoal: string[] = [];
        let inCoreGoal = false;

        for (const line of lines) {
          if (line.includes("## 核心目标") || line.includes("## Core Goal")) {
            inCoreGoal = true;
            continue;
          }
          if (inCoreGoal) {
            if (line.startsWith("##")) break;
            if (line.trim()) coreGoal.push(line);
          }
        }

        return {
          text:
            "📋 当前任务目标\n\n" +
            (exists
              ? "(从 MISSION_PARTNER.md 读取)\n\n"
              : "(默认值 - 文件不存在)\n\n") +
            coreGoal.slice(0, 10).join("\n") + // 最多显示10行
            (coreGoal.length > 10 ? "\n... (更多内容请查看文件)" : "") +
            "\n\n用法: /partner_mission <任务描述>",
        };
      }

      // v2.47: 写入新的任务目标
      const result = await engineService.updateMission(input);

      return {
        text: result.message + "\n\n" + "引擎将在下一循环中使用新的任务目标",
      };
    },
  });

  // 🔥 新增：/partner_analyze 命令 - 触发立即分析
  api.registerCommand({
    name: "partner_analyze",
    description: "触发代码质量分析并返回报告",
    handler: async (ctx) => {
      logger.info("📊 触发代码分析");
      const authCheck = checkAuth(ctx, "执行代码分析");
      if (!authCheck.authorized) {
        return authCheck.response!;
      }

      const analysis = await engineService.analyzeCurrentWorkspace();
      return {
        text: analysis,
      };
    },
  });

  // 🔥 新增：/partner_compress 命令 - 手动触发上下文压缩
  api.registerCommand({
    name: "partner_compress",
    description: "手动触发上下文压缩",
    handler: async () => {
      // v2.47: 使用公开的 compressContextNow 方法
      const result = engineService.compressContextNow();
      const savedPercent =
        result.before > 0
          ? Math.round((result.saved / result.before) * 100)
          : 0;

      return {
        text:
          "📦 上下文已压缩\n\n" +
          "压缩前: " +
          result.before +
          " 条\n" +
          "压缩后: " +
          result.after +
          " 条\n" +
          "节省: " +
          result.saved +
          " 条 (~" +
          savedPercent +
          "%)",
      };
    },
  });

  // 🆕 v2.48: /partner_voice_report 命令 - 语音汇报引擎状态
  api.registerCommand({
    name: "partner_voice_report",
    description: "使用语音播报引擎状态（需要 TTS 支持）",
    handler: async (_ctx) => {
      const status = getEngineStatus();

      // 构建语音文本
      const voiceText =
        `龙虾永动引擎状态报告。${status.running ? "引擎正在运行" : "引擎已停止"}。` +
        `已完成 ${status.loopCount} 次循环。` +
        `平均每次循环耗时 ${status.avgLoopTimeMs} 毫秒。` +
        `当前内存使用 ${Math.round(status.memoryUsageMB)} 兆字节。`;

      // 尝试使用 TTS
      if (api.runtime?.tts?.textToSpeechTelephony) {
        try {
          const audioBuffer = await api.runtime.tts.textToSpeechTelephony(
            voiceText,
            {
              language: "zh-CN",
              voice: "default",
            },
          );
          return {
            text:
              "🎙️ 语音报告已生成: " +
              voiceText +
              "\n\n(音频长度: " +
              audioBuffer.length +
              " 字节)",
          };
        } catch (e) {
          logger.warn(`TTS 失败: ${e}`);
          return { text: "⚠️ TTS 语音生成失败，返回文本报告:\n\n" + voiceText };
        }
      }

      // TTS 不可用，返回文本报告
      return {
        text:
          "📋 引擎状态（文本模式）:\n\n" +
          voiceText +
          "\n\n提示: 语音功能需要 OpenClaw 运行时支持 TTS",
      };
    },
  });

  // 注册 Gateway RPC 方法，签名：registerGatewayMethod(method: string, handler: fn)
  if (api.registerGatewayMethod) {
    api.registerGatewayMethod("lobster.getStatus", () => getEngineStatus());

    api.registerGatewayMethod("lobster.isRunning", () =>
      engineService.isRunning(),
    );

    api.registerGatewayMethod("lobster.getLoopCount", () =>
      engineService.getLoopCount(),
    );

    api.registerGatewayMethod("lobster.start", async (...args: unknown[]) => {
      const ctx = args[0] as OpenClawPluginServiceContext | undefined;
      try {
        if (!engineService.isRunning()) {
          await engineService.startLoop(ctx);
          return { success: true, message: "永动引擎已启动" };
        }
        return { success: true, message: "引擎已在运行中" };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    api.registerGatewayMethod("lobster.stop", async () => {
      if (engineService.isRunning()) {
        await engineService.stopLoop();
        return {
          success: true,
          message: "永动引擎已停止",
          loopCount: engineService.getLoopCount(),
        };
      }
      return { success: true, message: "引擎未运行" };
    });

    logger.info(
      "🔌 RPC 方法已注册: lobster.getStatus, lobster.isRunning, lobster.getLoopCount, lobster.start, lobster.stop",
    );
  }

  // 注册 gateway_start 钩子
  api.on(
    "gateway_start",
    async (_event, ctx) => {
      logger.info("🦞 Gateway 启动，永动引擎就绪");
      // 从插件专属配置读取自动启动设置（api.pluginConfig 才是插件 config，api.config 是全局 openclaw.json）
      const autoStart = isEnabled(
        (api.pluginConfig as Record<string, unknown>)?.auto_start_engine,
      );
      if (autoStart && !engineService.isRunning()) {
        logger.info("🚀 配置了自动启动，引擎自动启动");
        // 若 ctx.workspaceDir 存在则使用（测试场景/OpenClaw 提供了路径）；
        // 否则传 undefined，让 startLoop 依赖 service.start() 已保存的运行时上下文。
        // 这样可避免 gateway_start 时 ctx.workspaceDir=undefined 覆盖已有的合法路径。
        const startCtx = ctx?.workspaceDir ? ctx : undefined;
        await engineService
          .startLoop(startCtx)
          .catch((err) =>
            logger.error(
              `自动启动失败: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      }
    },
    { priority: 100 },
  );

  // 注册 gateway_pre_stop 钩子（v2.47）
  // 在 gateway 停止前触发，用于优雅关闭准备
  api.on(
    "gateway_pre_stop",
    async (_event, _ctx) => {
      logger.info("🦞 Gateway 即将停止，准备优雅关闭");

      // v2.48: 使用共享状态函数获取最终统计
      const status = getEngineStatus();
      const totalErrors = Object.values(status.errorStats).reduce(
        (sum, count) => sum + count,
        0,
      );

      logger.info(
        `📊 最终统计: 循环=${status.loopCount}, 平均耗时=${status.avgLoopTimeMs}ms, 错误=${totalErrors}`,
      );

      // 如果引擎正在运行，先停止它
      if (status.running) {
        logger.info("🛑 永动引擎运行中，将在 gateway_pre_stop 阶段停止");
        await engineService.stopLoop();
        logger.info("✅ 永动引擎已优雅停止");
      }
    },
    { priority: 100 },
  );

  // 注册 gateway_stop 钩子
  api.on(
    "gateway_stop",
    async (_event, _ctx) => {
      logger.info("🦞 Gateway 停止，永动引擎清理中");
      if (engineService.isRunning()) {
        await engineService.stopLoop();
        logger.info("🛑 永动引擎已自动停止");
      }
    },
    { priority: 100 },
  );

  logger.info("🦞 龙虾永动引擎插件已加载");
  // v2.48: 动态生成命令列表（避免手动维护）
  const REGISTERED_COMMANDS = [
    "start_partner",
    "stop_partner",
    "partner_status",
    "partner_mission",
    "partner_analyze",
    "partner_compress",
    "partner_voice_report",
  ];
  logger.info(
    `📋 可用命令 (${REGISTERED_COMMANDS.length}个): /${REGISTERED_COMMANDS.join(", /")}`,
  );
}
