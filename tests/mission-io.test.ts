import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  MissionManager,
  ErrorCategory,
  MissionFileNames,
} from "../src/engine/runtime/mission-io.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { createLogger, withTempWorkspace } from "./helpers.js";

function makeMgr(overrides = {}) {
  return new MissionManager(
    { logger: createLogger() },
    { ...DEFAULT_CONFIG, ...overrides },
  );
}

function makeCtx(workspaceDir: string) {
  return { workspaceDir } as unknown as Parameters<
    MissionManager["loadMissionFiles"]
  >[0];
}

describe("MissionManager", () => {
  describe("ErrorCategory", () => {
    it("包含所有预期类别", () => {
      assert.equal(ErrorCategory.UNKNOWN, "unknown");
      assert.equal(ErrorCategory.FILE_IO, "file_io");
      assert.equal(ErrorCategory.PARSE, "parse");
      assert.equal(ErrorCategory.NETWORK, "network");
      assert.equal(ErrorCategory.PERMISSION, "permission");
      assert.equal(ErrorCategory.TIMEOUT, "timeout");
    });
  });

  describe("MissionFileNames", () => {
    it("MISSION 文件名为 MISSION_PARTNER.md", () => {
      assert.equal(MissionFileNames.MISSION, "MISSION_PARTNER.md");
    });
    it("BOUNDARIES 文件名为 BOUNDARIES_PARTNER.md", () => {
      assert.equal(MissionFileNames.BOUNDARIES, "BOUNDARIES_PARTNER.md");
    });
  });

  describe("getDefaultMission / getDefaultBoundaries", () => {
    it("默认 MISSION 包含核心目标", () => {
      const mgr = makeMgr();
      assert.ok(mgr.getDefaultMission().includes("核心目标"));
    });
    it("默认 BOUNDARIES 包含绝对禁止", () => {
      const mgr = makeMgr();
      assert.ok(mgr.getDefaultBoundaries().includes("绝对禁止"));
    });
  });

  describe("readMission", () => {
    it("文件不存在时返回默认内容且 exists=false", async () => {
      const mgr = makeMgr();
      const { exists, mission } = await mgr.readMission("/nonexistent/dir");
      assert.equal(exists, false);
      assert.ok(mission.length > 0);
    });

    it("文件存在时返回文件内容且 exists=true", async () => {
      await withTempWorkspace("mission-read", async ({ workspaceDir }) => {
        const missionPath = path.join(workspaceDir, MissionFileNames.MISSION);
        await fs.writeFile(missionPath, "# My Mission\n");
        const mgr = makeMgr();
        const { exists, mission } = await mgr.readMission(workspaceDir);
        assert.equal(exists, true);
        assert.ok(mission.includes("My Mission"));
      });
    });
  });

  describe("loadMissionFiles", () => {
    it("文件不存在时返回默认内容", async () => {
      await withTempWorkspace(
        "mission-load-default",
        async ({ workspaceDir }) => {
          const mgr = makeMgr({ enableCache: false });
          const { mission, boundaries } = await mgr.loadMissionFiles(
            makeCtx(workspaceDir),
            workspaceDir,
            false,
            0,
          );
          assert.ok(mission.includes("核心目标"));
          assert.ok(boundaries.includes("绝对禁止"));
        },
      );
    });

    it("文件存在时返回文件内容", async () => {
      await withTempWorkspace(
        "mission-load-files",
        async ({ workspaceDir }) => {
          await fs.writeFile(
            path.join(workspaceDir, MissionFileNames.MISSION),
            "# Custom Mission",
          );
          await fs.writeFile(
            path.join(workspaceDir, MissionFileNames.BOUNDARIES),
            "# Custom Boundaries",
          );
          const mgr = makeMgr();
          const { mission, boundaries } = await mgr.loadMissionFiles(
            makeCtx(workspaceDir),
            workspaceDir,
            false,
            0,
          );
          assert.ok(mission.includes("Custom Mission"));
          assert.ok(boundaries.includes("Custom Boundaries"));
        },
      );
    });

    it("enableCache=true 时缓存内容", async () => {
      await withTempWorkspace("mission-cache", async ({ workspaceDir }) => {
        const missionPath = path.join(workspaceDir, MissionFileNames.MISSION);
        await fs.writeFile(missionPath, "original content");
        const mgr = makeMgr();
        await mgr.loadMissionFiles(
          makeCtx(workspaceDir),
          workspaceDir,
          true,
          60000,
        );
        // 修改文件，缓存仍返回旧内容
        await fs.writeFile(missionPath, "updated content");
        const { mission } = await mgr.loadMissionFiles(
          makeCtx(workspaceDir),
          workspaceDir,
          true,
          60000,
        );
        assert.ok(mission.includes("original"));
      });
    });

    it("clearCache 后重新读取", async () => {
      await withTempWorkspace(
        "mission-clearcache",
        async ({ workspaceDir }) => {
          const missionPath = path.join(workspaceDir, MissionFileNames.MISSION);
          await fs.writeFile(missionPath, "v1 content");
          const mgr = makeMgr();
          await mgr.loadMissionFiles(
            makeCtx(workspaceDir),
            workspaceDir,
            true,
            60000,
          );
          await fs.writeFile(missionPath, "v2 content");
          mgr.clearCache();
          const { mission } = await mgr.loadMissionFiles(
            makeCtx(workspaceDir),
            workspaceDir,
            true,
            60000,
          );
          assert.ok(mission.includes("v2"));
        },
      );
    });
  });

  describe("updateMission", () => {
    it("文件不存在时创建新文件", async () => {
      await withTempWorkspace(
        "mission-update-new",
        async ({ workspaceDir }) => {
          const mgr = makeMgr();
          const res = await mgr.updateMission(workspaceDir, "新目标");
          assert.equal(res.success, true);
          const content = await fs.readFile(res.path, "utf-8");
          assert.ok(content.includes("新目标"));
        },
      );
    });

    it("文件存在时更新核心目标章节", async () => {
      await withTempWorkspace(
        "mission-update-existing",
        async ({ workspaceDir }) => {
          const mgr = makeMgr();
          // 先写一个有核心目标章节的文件
          const missionPath = path.join(workspaceDir, "MISSION.md");
          await fs.writeFile(
            missionPath,
            [
              "# MISSION",
              "## 核心目标",
              "旧目标",
              "",
              "## 具体任务",
              "1. 任务一",
            ].join("\n"),
          );
          const res = await mgr.updateMission(workspaceDir, "新目标");
          assert.equal(res.success, true);
          const content = await fs.readFile(res.path, "utf-8");
          assert.ok(content.includes("新目标"));
        },
      );
    });
  });

  describe("parseMissionActions", () => {
    it("解析具体任务章节中的编号任务", () => {
      const mgr = makeMgr();
      const mission = [
        "## 具体任务",
        "1. 监控工作区",
        "2. 生成报告",
        "3. 发送通知",
        "## 其他章节",
      ].join("\n");
      const actions = mgr.parseMissionActions(mission);
      assert.deepEqual(actions, ["监控工作区", "生成报告", "发送通知"]);
    });

    it("没有具体任务章节时返回空数组", () => {
      const mgr = makeMgr();
      assert.deepEqual(mgr.parseMissionActions("# 无任务"), []);
    });
  });

  describe("planNextAction", () => {
    it("loopCount=0 时返回初始化行动", async () => {
      const mgr = makeMgr();
      const result = await mgr.planNextAction("", 0, { errors: [] });
      assert.equal(result.type, "init");
    });

    it("有未解决错误时优先返回错误恢复行动", async () => {
      const mgr = makeMgr();
      const errors = [
        { loop: 1, error: "bad", timestamp: Date.now(), category: "file_io" },
      ];
      const result = await mgr.planNextAction("", 5, { errors });
      assert.equal(result.type, "error_recovery");
    });

    it("已解决错误不触发恢复行动", async () => {
      const mgr = makeMgr();
      const errors = [
        { loop: 1, error: "bad", timestamp: Date.now(), resolved: true },
      ];
      const result = await mgr.planNextAction("", 2, { errors });
      assert.notEqual(result.type, "error_recovery");
    });

    it("有 MISSION 任务时循环执行", async () => {
      const mgr = makeMgr();
      const mission = "## 具体任务\n1. task_a\n2. task_b\n";
      const r1 = await mgr.planNextAction(mission, 1, { errors: [] });
      const r2 = await mgr.planNextAction(mission, 2, { errors: [] });
      assert.equal(r1.type, "execute");
      assert.ok(r1.description === "task_a" || r1.description === "task_b");
      assert.ok(r1.description !== r2.description);
    });
  });

  describe("updateMission — 无核心目标章节时追加", () => {
    it("文件内容无 ## 核心目标 时追加到末尾", async () => {
      await withTempWorkspace(
        "mission-update-no-section",
        async ({ workspaceDir }) => {
          const mgr = makeMgr();
          // Write MISSION_PARTNER.md without 核心目标 section
          const missionPath = path.join(workspaceDir, MissionFileNames.MISSION);
          await fs.writeFile(missionPath, "# MISSION\n\n## 其他章节\n内容\n");
          const res = await mgr.updateMission(workspaceDir, "追加的新目标");
          assert.equal(res.success, true);
          const content = await fs.readFile(res.path, "utf-8");
          assert.ok(content.includes("追加的新目标"));
        },
      );
    });
  });

  describe("updateMission — 写入失败时返回失败结果", () => {
    it("workspaceDir 只读时返回 success=false", async () => {
      await withTempWorkspace(
        "mission-update-fail",
        async ({ workspaceDir }) => {
          const mgr = makeMgr();
          // Make workspace read-only
          await fs.chmod(workspaceDir, 0o555);
          try {
            const res = await mgr.updateMission(workspaceDir, "新目标");
            assert.equal(res.success, false);
            assert.ok(res.message.includes("❌ 更新失败"));
          } finally {
            await fs.chmod(workspaceDir, 0o755);
          }
        },
      );
    });
  });

  describe("loadMissionFiles — 缓存带 enableCache 参数", () => {
    it("enableCache=true 时存入缓存，再次调用返回缓存值", async () => {
      await withTempWorkspace(
        "mission-cache-flag",
        async ({ workspaceDir }) => {
          const mgr = makeMgr();
          const missionPath = path.join(workspaceDir, MissionFileNames.MISSION);
          await fs.writeFile(missionPath, "# cached content");
          const first = await mgr.loadMissionFiles(
            makeCtx(workspaceDir),
            workspaceDir,
            true,
            60000,
          );
          // Overwrite file — cache should still return old
          await fs.writeFile(missionPath, "# updated content");
          const second = await mgr.loadMissionFiles(
            makeCtx(workspaceDir),
            workspaceDir,
            true,
            60000,
          );
          assert.equal(first.mission, second.mission);
        },
      );
    });
  });

  describe("loadMissionFiles — catch 块（覆盖 lines 149-163）", () => {
    it("getDefaultMission 抛出时走 catch 分支，enableCache=true 时设置缓存", async () => {
      await withTempWorkspace(
        "mission-catch-cover",
        async ({ workspaceDir }) => {
          const warned: string[] = [];
          const mgr = new MissionManager(
            {
              logger: {
                ...createLogger(),
                warn: (m: string) => warned.push(m),
              },
            },
            DEFAULT_CONFIG,
          );
          let defaultMissionCallCount = 0;
          (mgr as any).getDefaultMission = () => {
            defaultMissionCallCount++;
            if (defaultMissionCallCount === 1)
              throw new Error("forced mission error");
            return "fallback mission content";
          };
          const result = await mgr.loadMissionFiles(
            makeCtx(workspaceDir),
            workspaceDir,
            true,
            60000,
          );
          assert.ok(warned.some((m) => m.includes("无法加载")));
          assert.ok(result.mission.includes("fallback"));
        },
      );
    });
  });

  describe("getErrorRecoveryAction", () => {
    it("file_io 错误返回文件操作建议", () => {
      const mgr = makeMgr();
      const action = mgr.getErrorRecoveryAction({
        loop: 1,
        error: "io err",
        timestamp: 0,
        category: ErrorCategory.FILE_IO,
      });
      assert.ok(action.description.includes("文件"));
    });

    it("unknown 错误包含错误详情片段", () => {
      const mgr = makeMgr();
      const longError = "a".repeat(50);
      const action = mgr.getErrorRecoveryAction({
        loop: 1,
        error: longError,
        timestamp: 0,
        category: ErrorCategory.UNKNOWN,
      });
      assert.ok(action.description.includes("..."));
    });

    it("category 缺失时走 || ErrorCategory.UNKNOWN 分支（覆盖 line 374）", () => {
      const mgr = makeMgr();
      // ErrorRecord.category 是可选字段，省略时触发 || UNKNOWN 回退
      const action = mgr.getErrorRecoveryAction({
        loop: 1,
        error: "some error",
        timestamp: 0,
      });
      // 没有 category，等同于 UNKNOWN，描述应包含 "..."
      assert.ok(action.description.includes("..."));
    });

    it("未知 category 走 ?? RecoveryMessages[UNKNOWN] 分支（覆盖 line 375）", () => {
      const mgr = makeMgr();
      // 使用不在 RecoveryMessages 中的字符串，运行时 RecoveryMessages[key] 为 undefined
      const action = mgr.getErrorRecoveryAction({
        loop: 1,
        error: "err",
        timestamp: 0,
        category: "definitely_unknown_key" as ErrorCategory,
      });
      // ?? 回退到 UNKNOWN 消息，category 不等于 UNKNOWN 所以走 return { description: message }
      assert.ok(
        typeof action.description === "string" && action.description.length > 0,
      );
    });
  });

  describe("updateMission — catch 块 String(error) 分支（覆盖 line 265）", () => {
    it("内部抛出非 Error 时走 String(error) 分支", async () => {
      await withTempWorkspace(
        "mission-update-non-error",
        async ({ workspaceDir }) => {
          const mgr = makeMgr();
          // 无 MISSION 文件时内层 catch 调用 getDefaultMission()
          // 将其替换为抛出非 Error 字符串，触发外层 catch 的 String(error) 分支
          (mgr as any).getDefaultMission = () => {
            throw "non-error-update-string";
          };
          const res = await mgr.updateMission(workspaceDir, "新目标");
          assert.equal(res.success, false);
          assert.ok(res.message.includes("non-error-update-string"));
        },
      );
    });
  });
});
