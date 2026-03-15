import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { PerpetualEngineService } from "../src/engine/service.js";
import { createLogger, eventually, withTempWorkspace } from "./helpers.js";

test("PerpetualEngineService should read and write mission files inside the host workspace", async () => {
  await withTempWorkspace(
    "lobster-service-mission",
    async ({ workspaceDir, stateDir }) => {
      const engine = new PerpetualEngineService({ logger: createLogger() });
      await engine.start({
        config: {},
        workspaceDir,
        stateDir,
        logger: createLogger(),
      });

      const updateResult = await engine.updateMission("修复 OpenClaw 集成");
      assert.equal(updateResult.success, true);
      assert.equal(
        updateResult.path,
        path.join(workspaceDir, "MISSION_PARTNER.md"),
      );

      const mission = await engine.readMission();
      assert.equal(mission.exists, true);
      assert.equal(mission.path, path.join(workspaceDir, "MISSION_PARTNER.md"));

      const content = await fs.readFile(mission.path, "utf-8");
      assert.match(content, /修复 OpenClaw 集成/);
    },
  );
});

test("PerpetualEngineService command start should persist state into the host state directory", async () => {
  await withTempWorkspace(
    "lobster-service-state",
    async ({ workspaceDir, stateDir }) => {
      await fs.writeFile(
        path.join(workspaceDir, "MISSION_PARTNER.md"),
        "# MISSION\n\n## 核心目标\n验证状态持久化\n\n## 具体任务\n1. 检查代码\n",
        "utf-8",
      );

      const engine = new PerpetualEngineService(
        { logger: createLogger() },
        {
          reportInterval: 1,
          compressInterval: 10,
          persistInterval: 1,
          enableHealthCheck: false,
        },
      );

      await engine.start({
        config: {},
        workspaceDir,
        stateDir,
        logger: createLogger(),
      });
      await engine.startFromCommand({
        channel: "channel-1",
        commandBody: "",
        config: {},
        isAuthorizedSender: true,
      });

      const statePath = path.join(stateDir, "engine-state.json");

      await eventually(
        async () => {
          const state = JSON.parse(await fs.readFile(statePath, "utf-8")) as {
            loopCount?: number;
          };
          assert.equal(typeof state.loopCount, "number");
          assert.ok((state.loopCount ?? 0) >= 2);
        },
        { timeoutMs: 2000, intervalMs: 50 },
      );

      await engine.stopLoop();
    },
  );
});

test("PerpetualEngineService should honor persistInterval independently from reportInterval", async () => {
  await withTempWorkspace(
    "lobster-service-persist-interval",
    async ({ workspaceDir, stateDir }) => {
      await fs.writeFile(
        path.join(workspaceDir, "MISSION_PARTNER.md"),
        "# MISSION\n\n## 核心目标\n验证独立持久化\n\n## 具体任务\n1. 检查代码\n",
        "utf-8",
      );

      const engine = new PerpetualEngineService(
        { logger: createLogger() },
        {
          reportInterval: 1_000_000,
          compressInterval: 10,
          persistInterval: 1,
          enableHealthCheck: false,
        },
      );

      await engine.start({
        config: {},
        workspaceDir,
        stateDir,
        logger: createLogger(),
      });
      await engine.startFromCommand({
        channel: "channel-2",
        commandBody: "",
        config: {},
        isAuthorizedSender: true,
      });

      const statePath = path.join(stateDir, "engine-state.json");

      await eventually(
        async () => {
          const state = JSON.parse(await fs.readFile(statePath, "utf-8")) as {
            loopCount?: number;
          };
          assert.equal(typeof state.loopCount, "number");
          assert.ok((state.loopCount ?? 0) >= 2);
        },
        { timeoutMs: 2000, intervalMs: 50 },
      );

      await engine.stopLoop();
    },
  );
});

test("PerpetualEngineService should bypass mission cache when enableCache is false", async () => {
  await withTempWorkspace(
    "lobster-service-no-cache",
    async ({ workspaceDir, stateDir }) => {
      const logger = createLogger();
      const engine = new PerpetualEngineService(
        { logger },
        { enableCache: false, cacheTTL: 60_000, enableHealthCheck: false },
      );

      const context = { config: {}, workspaceDir, stateDir, logger };

      await fs.writeFile(
        path.join(workspaceDir, "MISSION_PARTNER.md"),
        "# MISSION\n\n## 核心目标\n第一次任务\n",
        "utf-8",
      );

      await engine.start(context);

      const firstLoad = (await (engine as any).loadMissionFiles(context)) as {
        mission: string;
      };
      assert.match(firstLoad.mission, /第一次任务/);

      await fs.writeFile(
        path.join(workspaceDir, "MISSION_PARTNER.md"),
        "# MISSION\n\n## 核心目标\n第二次任务\n",
        "utf-8",
      );

      const secondLoad = (await (engine as any).loadMissionFiles(context)) as {
        mission: string;
      };
      assert.match(secondLoad.mission, /第二次任务/);
    },
  );
});

test("PerpetualEngineService should persist report metadata with llm settings when reportTarget is state", async () => {
  await withTempWorkspace(
    "lobster-service-report-state",
    async ({ workspaceDir, stateDir }) => {
      const logger = createLogger();
      const engine = new PerpetualEngineService(
        { logger },
        {
          reportTarget: "state",
          reportChannel: "channel-42",
          llmProvider: "openclaw",
          llmModel: "gpt-5.1",
          llmBaseURL: "https://llm.internal/v1",
          enableHealthCheck: false,
        },
      );

      const context = { config: {}, workspaceDir, stateDir, logger };
      await engine.start(context);

      await (engine as any).sendReport(context, {
        loop: 7,
        action: "生成汇报",
        result: "完成",
      });

      const latestReportPath = path.join(stateDir, "latest-report.json");
      const report = JSON.parse(
        await fs.readFile(latestReportPath, "utf-8"),
      ) as {
        reportTarget?: string;
        reportChannel?: string;
        llm?: { provider?: string; model?: string; baseURL?: string };
      };

      assert.equal(report.reportTarget, "state");
      assert.equal(report.reportChannel, "channel-42");
      assert.deepEqual(report.llm, {
        provider: "openclaw",
        model: "gpt-5.1",
        baseURL: "https://llm.internal/v1",
      });
    },
  );
});

test("PerpetualEngineService should skip report files when reportTarget is log", async () => {
  await withTempWorkspace(
    "lobster-service-report-log",
    async ({ workspaceDir, stateDir }) => {
      const logger = createLogger();
      const engine = new PerpetualEngineService(
        { logger },
        {
          reportTarget: "log",
          enableHealthCheck: false,
        },
      );

      const context = { config: {}, workspaceDir, stateDir, logger };
      await engine.start(context);

      await (engine as any).sendReport(context, {
        loop: 1,
        action: "记录日志",
        result: "完成",
      });

      await assert.rejects(
        fs.readFile(path.join(stateDir, "latest-report.json"), "utf-8"),
      );
    },
  );
});

test("PerpetualEngineService should not mark recovery errors resolved before remediation succeeds", async () => {
  await withTempWorkspace(
    "lobster-service-recovery",
    async ({ workspaceDir, stateDir }) => {
      const logger = createLogger();
      const engine = new PerpetualEngineService(
        { logger },
        { enableHealthCheck: false },
      );
      const context = { config: {}, workspaceDir, stateDir, logger };

      await engine.start(context);

      const recoveryTimestamp = Date.now();
      (engine as any).context.errors.push({
        loop: 3,
        error: "读取文件失败",
        timestamp: recoveryTimestamp,
        category: "file_io",
        resolved: false,
      });

      const result = (await (engine as any).executeAction(
        {
          description: "重试文件读取并检查权限",
          type: "error_recovery",
          recoveryErrorTimestamp: recoveryTimestamp,
        },
        context,
      )) as { summary: string };

      assert.match(result.summary, /已记录错误/);
      assert.equal((engine as any).context.errors[0].resolved, false);
    },
  );
});
