import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { ReportingManager } from "../src/engine/runtime/reporting.js";
import { StateFileNames } from "../src/engine/runtime/state-persistence.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { createLogger, withTempWorkspace } from "./helpers.js";

function makeCtx(stateDir: string) {
  return {
    stateDir,
    workspaceDir: stateDir,
    pluginDir: stateDir,
    configDir: stateDir,
    dataDir: stateDir,
  } as unknown as Parameters<typeof ReportingManager.prototype.sendReport>[0];
}

function makeStatus(n = 1) {
  return { loop: n, action: "test_action", result: "ok" };
}

describe("ReportingManager", () => {
  describe("sendReport — reportTarget=log（不落盘）", () => {
    it("不写文件时日志调用 info", async () => {
      const logged: string[] = [];
      const logger = {
        ...createLogger(),
        info: (m: string) => {
          logged.push(m);
        },
      };
      const mgr = new ReportingManager(
        { logger },
        { ...DEFAULT_CONFIG, reportTarget: "log" },
      );
      await mgr.sendReport(makeCtx("/tmp"), makeStatus(), true, 0, 0, 0, {});
      assert.ok(logged.some((m) => m.includes("循环 1")));
    });
  });

  describe("sendReport — reportTarget=state（落盘）", () => {
    it("生成 latest-report.json 文件", async () => {
      await withTempWorkspace("reporting", async ({ stateDir }) => {
        const mgr = new ReportingManager(
          { logger: createLogger() },
          { ...DEFAULT_CONFIG, reportTarget: "state" },
        );
        await mgr.sendReport(
          makeCtx(stateDir),
          makeStatus(5),
          true,
          10,
          2,
          1024,
          {},
        );
        const p = path.join(stateDir, StateFileNames.LATEST_REPORT);
        const data = JSON.parse(await fs.readFile(p, "utf-8"));
        assert.equal(data.loop, 5);
        assert.equal(data.action, "test_action");
        assert.equal(data.result, "ok");
      });
    });

    it("报告包含 timestamp 字段（ISO 格式）", async () => {
      await withTempWorkspace("reporting-ts", async ({ stateDir }) => {
        const mgr = new ReportingManager(
          { logger: createLogger() },
          { ...DEFAULT_CONFIG, reportTarget: "state" },
        );
        await mgr.sendReport(
          makeCtx(stateDir),
          makeStatus(),
          false,
          0,
          0,
          0,
          {},
        );
        const p = path.join(stateDir, StateFileNames.LATEST_REPORT);
        const data = JSON.parse(await fs.readFile(p, "utf-8"));
        assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(data.timestamp));
      });
    });

    it("多次调用追加到 report-history.jsonl", async () => {
      await withTempWorkspace("reporting-hist", async ({ stateDir }) => {
        const mgr = new ReportingManager(
          { logger: createLogger() },
          { ...DEFAULT_CONFIG, reportTarget: "state" },
        );
        await mgr.sendReport(
          makeCtx(stateDir),
          makeStatus(1),
          true,
          0,
          0,
          0,
          {},
        );
        await mgr.sendReport(
          makeCtx(stateDir),
          makeStatus(2),
          true,
          0,
          0,
          0,
          {},
        );
        const histPath = path.join(stateDir, StateFileNames.REPORT_HISTORY);
        const lines = (await fs.readFile(histPath, "utf-8")).trim().split("\n");
        assert.equal(lines.length, 2);
        assert.equal(JSON.parse(lines[0]).loop, 1);
        assert.equal(JSON.parse(lines[1]).loop, 2);
      });
    });

    it("报告包含 llm 和 errorStats 字段", async () => {
      await withTempWorkspace("reporting-llm", async ({ stateDir }) => {
        const config = {
          ...DEFAULT_CONFIG,
          reportTarget: "state" as const,
          llmProvider: "anthropic" as const,
          llmModel: "claude-3",
        };
        const mgr = new ReportingManager({ logger: createLogger() }, config);
        const errors = { file_io: 1, llm: 2 };
        await mgr.sendReport(
          makeCtx(stateDir),
          makeStatus(),
          true,
          0,
          0,
          0,
          errors,
        );
        const p = path.join(stateDir, StateFileNames.LATEST_REPORT);
        const data = JSON.parse(await fs.readFile(p, "utf-8"));
        assert.equal(data.llm.provider, "anthropic");
        assert.equal(data.llm.model, "claude-3");
        assert.deepEqual(data.errorStats, errors);
      });
    });

    it("stateDir 不存在时自动创建目录", async () => {
      await withTempWorkspace("reporting-mkdir", async ({ stateDir }) => {
        const nested = path.join(stateDir, "deep", "nested");
        const mgr = new ReportingManager(
          { logger: createLogger() },
          { ...DEFAULT_CONFIG, reportTarget: "state" },
        );
        await mgr.sendReport(makeCtx(nested), makeStatus(), true, 0, 0, 0, {});
        const p = path.join(nested, StateFileNames.LATEST_REPORT);
        const data = JSON.parse(await fs.readFile(p, "utf-8"));
        assert.equal(data.loop, 1);
      });
    });
  });

  describe("sendReport — 外部通知（discord/telegram 无 channel 时警告）", () => {
    it("discord 无 channel 时 warn 日志", async () => {
      const warned: string[] = [];
      const logger = {
        ...createLogger(),
        warn: (m: string) => {
          warned.push(m);
        },
      };
      const mgr = new ReportingManager(
        { logger },
        { ...DEFAULT_CONFIG, reportTarget: "discord" },
      );
      // stateDir 设为 /tmp 避免写文件失败
      await withTempWorkspace("reporting-discord", async ({ stateDir }) => {
        await mgr.sendReport(
          makeCtx(stateDir),
          makeStatus(),
          true,
          0,
          0,
          0,
          {},
        );
      });
      assert.ok(warned.some((m) => m.includes("reportChannel 缺失")));
    });
  });

  describe("sendReport — 落盘失败时 warn", () => {
    it("stateDir 只读时警告 '汇报落盘失败'", async () => {
      await withTempWorkspace("reporting-write-fail", async ({ stateDir }) => {
        const warned: string[] = [];
        const logger = {
          ...createLogger(),
          warn: (m: string) => {
            warned.push(m);
          },
        };
        const mgr = new ReportingManager(
          { logger },
          { ...DEFAULT_CONFIG, reportTarget: "state" },
        );
        // Make stateDir read-only
        await fs.chmod(stateDir, 0o555);
        try {
          await mgr.sendReport(
            makeCtx(stateDir),
            makeStatus(),
            true,
            0,
            0,
            0,
            {},
          );
          assert.ok(warned.some((m) => m.includes("汇报落盘失败")));
        } finally {
          await fs.chmod(stateDir, 0o755);
        }
      });
    });
  });

  describe("sendReport — 外部通知（discord 有 channel 时不抛异常）", () => {
    it("discord 有假 channel 时正常执行（通知器内部处理网络错误）", async () => {
      const mgr = new ReportingManager(
        { logger: createLogger() },
        {
          ...DEFAULT_CONFIG,
          reportTarget: "discord",
          reportChannel: "https://discord.invalid/webhook/fake",
        },
      );
      await withTempWorkspace("reporting-discord-ch", async ({ stateDir }) => {
        // 不应抛出异常
        await assert.doesNotReject(() =>
          mgr.sendReport(makeCtx(stateDir), makeStatus(), true, 0, 0, 0, {}),
        );
      });
    });
  });

  describe("sendReport — telegram 无 botToken 时记录外部汇报失败", () => {
    it("telegram 无 bot token 时 catch 块记录外部汇报失败", async () => {
      await withTempWorkspace(
        "reporting-telegram-notoken",
        async ({ stateDir }) => {
          const warned: string[] = [];
          const logger = {
            ...createLogger(),
            warn: (m: string) => {
              warned.push(m);
            },
          };
          const mgr = new ReportingManager(
            { logger },
            {
              ...DEFAULT_CONFIG,
              reportTarget: "telegram",
              reportChannel: "123456789",
              // telegramBotToken 未提供
            },
          );
          // 确保环境变量也不存在
          const origToken = process.env.TELEGRAM_BOT_TOKEN;
          delete process.env.TELEGRAM_BOT_TOKEN;
          try {
            await mgr.sendReport(
              makeCtx(stateDir),
              makeStatus(),
              true,
              0,
              0,
              0,
              {},
            );
            assert.ok(warned.some((m) => m.includes("外部汇报失败")));
          } finally {
            if (origToken !== undefined)
              process.env.TELEGRAM_BOT_TOKEN = origToken;
          }
        },
      );
    });
  });

  describe("sendReport — telegram 有 botToken 时创建 TELEGRAM 通知器", () => {
    it("telegram 有 botToken 时不抛异常（通知器内部处理网络错误）", async () => {
      await withTempWorkspace(
        "reporting-telegram-with-token",
        async ({ stateDir }) => {
          const mgr = new ReportingManager(
            { logger: createLogger() },
            {
              ...DEFAULT_CONFIG,
              reportTarget: "telegram",
              reportChannel: "123456789",
              telegramBotToken: "fake-bot-token-for-test",
            },
          );
          await assert.doesNotReject(() =>
            mgr.sendReport(makeCtx(stateDir), makeStatus(), true, 0, 0, 0, {}),
          );
        },
      );
    });
  });

  describe("writeSuggestionLog — 落盘失败时静默处理", () => {
    it("stateDir 只读时不抛出异常", async () => {
      await withTempWorkspace("reporting-sug-fail", async ({ stateDir }) => {
        const mgr = new ReportingManager(
          { logger: createLogger() },
          DEFAULT_CONFIG,
        );
        // Make stateDir read-only so appendFile fails
        await fs.chmod(stateDir, 0o555);
        try {
          await assert.doesNotReject(() =>
            mgr.writeSuggestionLog(makeCtx(stateDir), "test suggestion"),
          );
        } finally {
          await fs.chmod(stateDir, 0o755);
        }
      });
    });
  });

  describe("writeSuggestionLog", () => {
    it("写入 suggestions.log 文件", async () => {
      await withTempWorkspace("reporting-sug", async ({ stateDir }) => {
        const mgr = new ReportingManager(
          { logger: createLogger() },
          DEFAULT_CONFIG,
        );
        await mgr.writeSuggestionLog(makeCtx(stateDir), "do something");
        const p = path.join(stateDir, StateFileNames.SUGGESTIONS_LOG);
        const content = await fs.readFile(p, "utf-8");
        assert.ok(content.includes("do something"));
      });
    });

    it("多次追加到同一文件", async () => {
      await withTempWorkspace("reporting-sug2", async ({ stateDir }) => {
        const mgr = new ReportingManager(
          { logger: createLogger() },
          DEFAULT_CONFIG,
        );
        await mgr.writeSuggestionLog(makeCtx(stateDir), "first");
        await mgr.writeSuggestionLog(makeCtx(stateDir), "second");
        const p = path.join(stateDir, StateFileNames.SUGGESTIONS_LOG);
        const content = await fs.readFile(p, "utf-8");
        assert.ok(content.includes("first"));
        assert.ok(content.includes("second"));
      });
    });
  });

  describe("sendReport — 落盘失败时 String(error) 分支", () => {
    it("ctx.stateDir 访问抛出非 Error 时走 String(error) 分支（覆盖 line 110）", async () => {
      const warned: string[] = [];
      const logger = {
        ...createLogger(),
        warn: (m: string) => {
          warned.push(m);
        },
      };
      const mgr = new ReportingManager(
        { logger },
        { ...DEFAULT_CONFIG, reportTarget: "state" },
      );
      const ctx: any = {};
      Object.defineProperty(ctx, "stateDir", {
        get() {
          throw "non-error-stateDir";
        },
      });
      await mgr.sendReport(ctx, makeStatus(), true, 0, 0, 0, {});
      assert.ok(warned.some((m) => m.includes("汇报落盘失败")));
      assert.ok(warned.some((m) => m.includes("non-error-stateDir")));
    });
  });

  describe("sendExternalReport — 外部汇报失败时 String(error) 分支", () => {
    it("reportChannel 访问抛出非 Error 时走 String(error) 分支（覆盖 line 173）", async () => {
      const warned: string[] = [];
      const logger = {
        ...createLogger(),
        warn: (m: string) => {
          warned.push(m);
        },
      };
      const mgr = new ReportingManager(
        { logger },
        { ...DEFAULT_CONFIG, reportTarget: "discord" },
      );
      let channelAccessCount = 0;
      const fakeRecord: any = {
        loop: 1,
        action: "test",
        result: "ok",
        reportTarget: "discord",
        llm: { provider: "test", model: undefined, baseURL: undefined },
      };
      Object.defineProperty(fakeRecord, "reportChannel", {
        get() {
          channelAccessCount++;
          if (channelAccessCount === 1) return "https://discord.invalid/fake";
          throw "non-error-reportChannel";
        },
      });
      await (mgr as any).sendExternalReport(fakeRecord);
      assert.ok(warned.some((m) => m.includes("外部汇报失败")));
      assert.ok(warned.some((m) => m.includes("non-error-reportChannel")));
    });
  });
});
