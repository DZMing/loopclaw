import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { CodeAnalysisManager } from "../src/engine/runtime/code-analysis.js";
import { LobsterCodeAnalyzer } from "../src/engine/code-analyzer.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { createLogger, withTempWorkspace } from "./helpers.js";

function makeCtx(workspaceDir: string) {
  return { workspaceDir } as unknown as Parameters<
    CodeAnalysisManager["analyzeDirectory"]
  >[0];
}

describe("CodeAnalysisManager", () => {
  describe("countFileTypes", () => {
    it("正确统计各扩展名数量", () => {
      const mgr = new CodeAnalysisManager(
        { logger: createLogger() },
        DEFAULT_CONFIG,
      );
      const stats = mgr.countFileTypes([
        "a.ts",
        "b.ts",
        "c.js",
        "d.json",
        "README.md",
        "other.txt",
      ]);
      assert.equal(stats.ts, 2);
      assert.equal(stats.js, 1);
      assert.equal(stats.json, 1);
      assert.equal(stats.md, 1);
    });

    it("空文件列表返回全零", () => {
      const mgr = new CodeAnalysisManager(
        { logger: createLogger() },
        DEFAULT_CONFIG,
      );
      const stats = mgr.countFileTypes([]);
      assert.deepEqual(stats, { ts: 0, js: 0, json: 0, md: 0 });
    });
  });

  describe("getCachedFiles", () => {
    it("enableCache=false 时直接读目录（不缓存）", async () => {
      await withTempWorkspace("codeanalysis-nocache", async ({ stateDir }) => {
        await fs.writeFile(path.join(stateDir, "a.ts"), "");
        const mgr = new CodeAnalysisManager(
          { logger: createLogger() },
          { ...DEFAULT_CONFIG, enableCache: false },
        );
        const files = await mgr.getCachedFiles(stateDir);
        assert.ok(files.includes("a.ts"));
      });
    });

    it("enableCache=true 时缓存文件列表", async () => {
      await withTempWorkspace("codeanalysis-cache", async ({ stateDir }) => {
        await fs.writeFile(path.join(stateDir, "b.ts"), "");
        const mgr = new CodeAnalysisManager(
          { logger: createLogger() },
          { ...DEFAULT_CONFIG, enableCache: true, cacheTTL: 60000 },
        );
        const first = await mgr.getCachedFiles(stateDir);
        // 添加新文件
        await fs.writeFile(path.join(stateDir, "c.ts"), "");
        const second = await mgr.getCachedFiles(stateDir);
        // 缓存命中，不包含新文件
        assert.deepEqual(first, second);
      });
    });

    it("缓存过期后重新读取", async () => {
      await withTempWorkspace("codeanalysis-ttl", async ({ stateDir }) => {
        await fs.writeFile(path.join(stateDir, "d.ts"), "");
        const mgr = new CodeAnalysisManager(
          { logger: createLogger() },
          { ...DEFAULT_CONFIG, enableCache: true, cacheTTL: -1 }, // TTL 立即过期
        );
        await mgr.getCachedFiles(stateDir);
        await fs.writeFile(path.join(stateDir, "e.ts"), "");
        const second = await mgr.getCachedFiles(stateDir);
        assert.ok(second.includes("e.ts"));
      });
    });
  });

  describe("analyzeDirectory", () => {
    it("返回包含文件总数的报告", async () => {
      await withTempWorkspace("codeanalysis-dir", async ({ stateDir }) => {
        await fs.writeFile(path.join(stateDir, "f.ts"), "");
        await fs.writeFile(path.join(stateDir, "g.md"), "");
        const mgr = new CodeAnalysisManager(
          { logger: createLogger() },
          { ...DEFAULT_CONFIG, enableCache: false },
        );
        const report = await mgr.analyzeDirectory(makeCtx(stateDir));
        assert.ok(report.includes("总文件"));
      });
    });

    it("目录不存在时降级返回分析完成消息", async () => {
      const mgr = new CodeAnalysisManager(
        { logger: createLogger() },
        DEFAULT_CONFIG,
      );
      const result = await mgr.analyzeDirectory(
        makeCtx("/nonexistent/path/xyz"),
      );
      assert.ok(typeof result === "string" && result.length > 0);
    });

    it("targetDir 参数优先使用", async () => {
      await withTempWorkspace(
        "codeanalysis-target",
        async ({ stateDir, workspaceDir }) => {
          await fs.writeFile(path.join(stateDir, "h.ts"), "");
          const mgr = new CodeAnalysisManager(
            { logger: createLogger() },
            { ...DEFAULT_CONFIG, enableCache: false },
          );
          const report = await mgr.analyzeDirectory(
            makeCtx(workspaceDir),
            stateDir,
          );
          assert.ok(report.includes(stateDir));
        },
      );
    });
  });

  describe("cleanExpiredCache", () => {
    it("未过期缓存不被清理", async () => {
      await withTempWorkspace("codeanalysis-clean", async ({ stateDir }) => {
        const mgr = new CodeAnalysisManager(
          { logger: createLogger() },
          { ...DEFAULT_CONFIG, enableCache: true, cacheTTL: 60000 },
        );
        await fs.writeFile(path.join(stateDir, "i.ts"), "");
        await mgr.getCachedFiles(stateDir);
        mgr.cleanExpiredCache(); // 不应该清理
        // 再次获取应从缓存
        const cached = await mgr.getCachedFiles(stateDir);
        assert.ok(cached.includes("i.ts"));
      });
    });

    it("clearCache 清空所有缓存", async () => {
      await withTempWorkspace("codeanalysis-clearall", async ({ stateDir }) => {
        const mgr = new CodeAnalysisManager(
          { logger: createLogger() },
          { ...DEFAULT_CONFIG, enableCache: true, cacheTTL: 60000 },
        );
        await fs.writeFile(path.join(stateDir, "j.ts"), "");
        await mgr.getCachedFiles(stateDir);
        mgr.clearCache();
        // 添加新文件，清空后能看到
        await fs.writeFile(path.join(stateDir, "k.ts"), "");
        const files = await mgr.getCachedFiles(stateDir);
        assert.ok(files.includes("k.ts"));
      });
    });

    it("过期缓存被清理且记录 debug 日志", async () => {
      await withTempWorkspace("codeanalysis-expired", async ({ stateDir }) => {
        const debugs: string[] = [];
        const logger = {
          ...createLogger(),
          debug: (m: string) => {
            debugs.push(m);
          },
        };
        const mgr = new CodeAnalysisManager(
          { logger },
          { ...DEFAULT_CONFIG, enableCache: true, cacheTTL: -1 }, // maxAge=-2，所有条目立即过期
        );
        await fs.writeFile(path.join(stateDir, "l.ts"), "");
        // 填充缓存
        await mgr.getCachedFiles(stateDir);
        // 清理过期条目
        mgr.cleanExpiredCache();
        // 应记录 debug 日志（cleaned > 0）
        assert.ok(debugs.some((m) => m.includes("过期缓存条目")));
        // 清理后添加新文件，再次获取应能看到新文件
        await fs.writeFile(path.join(stateDir, "m.ts"), "");
        const files = await mgr.getCachedFiles(stateDir);
        assert.ok(files.includes("m.ts"));
      });
    });
  });

  describe("analyzeDirectory — targetDir 不存在时走 '目录' 分支", () => {
    it("指定 targetDir 但不存在时返回完成消息（不抛出）", async () => {
      await withTempWorkspace(
        "codeanalysis-targetdir-missing",
        async ({ workspaceDir }) => {
          const mgr = new CodeAnalysisManager(
            { logger: createLogger() },
            { ...DEFAULT_CONFIG, enableCache: false },
          );
          const result = await mgr.analyzeDirectory(
            makeCtx(workspaceDir),
            "/nonexistent/target/xyz",
          );
          assert.ok(typeof result === "string" && result.length > 0);
        },
      );
    });
  });

  describe("analyzeDirectory — 覆盖剩余分支", () => {
    it("workspaceDir 为 undefined 时走 ?? '.' 分支（覆盖 line 140）", async () => {
      const mgr = new CodeAnalysisManager(
        { logger: createLogger() },
        { ...DEFAULT_CONFIG, enableCache: false },
      );
      // 不传 targetDir，ctx.workspaceDir 为 undefined → dirPath = "."
      const ctx = { workspaceDir: undefined } as unknown as Parameters<
        CodeAnalysisManager["analyzeDirectory"]
      >[0];
      const result = await mgr.analyzeDirectory(ctx);
      // "." 可能存在或不存在，均应返回字符串而不抛出
      assert.ok(typeof result === "string" && result.length > 0);
    });

    it("目录只含 .js 和 .json 文件时覆盖 lines 152-154 中的 FALSE/TRUE 分支", async () => {
      await withTempWorkspace("codeanalysis-js-json", async ({ stateDir }) => {
        // 只放 .js 和 .json 文件，无 .ts 文件
        await fs.writeFile(path.join(stateDir, "app.js"), "");
        await fs.writeFile(path.join(stateDir, "config.json"), "{}");
        const mgr = new CodeAnalysisManager(
          { logger: createLogger() },
          { ...DEFAULT_CONFIG, enableCache: false },
        );
        const report = await mgr.analyzeDirectory(makeCtx(stateDir));
        // stats.ts=0 → 空字符串（line 152 FALSE 分支被覆盖）
        // stats.js>0 → "📙 JavaScript: 1"（line 153 TRUE 分支被覆盖）
        // stats.json>0 → "📋 JSON: 1"（line 154 TRUE 分支被覆盖）
        assert.ok(!report.includes("TypeScript"));
        assert.ok(report.includes("JavaScript"));
        assert.ok(report.includes("JSON"));
      });
    });

    it("getCachedFiles 抛出非 Error 时走 String(error) 分支（覆盖 line 164 falsy）", async () => {
      const mgr = new CodeAnalysisManager(
        { logger: createLogger() },
        DEFAULT_CONFIG,
      );
      (mgr as any).getCachedFiles = async () => {
        throw "non-error-cached-files";
      };
      const result = await mgr.analyzeDirectory(
        makeCtx("/some/path"),
        "/some/target",
      );
      assert.ok(typeof result === "string" && result.length > 0);
    });
  });

  describe("analyzeCodebase", () => {
    it("workspaceDir 不存在时返回完成消息", async () => {
      const mgr = new CodeAnalysisManager(
        { logger: createLogger() },
        DEFAULT_CONFIG,
      );
      const ctx = { workspaceDir: "/nonexistent/dir" } as unknown as Parameters<
        CodeAnalysisManager["analyzeCodebase"]
      >[0];
      const result = await mgr.analyzeCodebase(ctx);
      assert.ok(typeof result === "string");
    });

    it("workspaceDir 为空字符串时提前返回完成消息", async () => {
      const mgr = new CodeAnalysisManager(
        { logger: createLogger() },
        DEFAULT_CONFIG,
      );
      const ctx = { workspaceDir: "" } as unknown as Parameters<
        CodeAnalysisManager["analyzeCodebase"]
      >[0];
      const result = await mgr.analyzeCodebase(ctx);
      assert.ok(typeof result === "string" && result.length > 0);
    });

    it("ctx.workspaceDir 访问抛出非 Error 时走 String(error) 分支（覆盖 line 120）", async () => {
      const mgr = new CodeAnalysisManager(
        { logger: createLogger() },
        DEFAULT_CONFIG,
      );
      const ctx: any = {};
      Object.defineProperty(ctx, "workspaceDir", {
        get() {
          throw "non-error-workspaceDir";
        },
      });
      const result = await mgr.analyzeCodebase(ctx);
      assert.ok(typeof result === "string" && result.length > 0);
    });

    it("analyzeProject 抛出 Error 时走 error.message 分支（覆盖 line 120 truthy）", async () => {
      const mgr = new CodeAnalysisManager(
        { logger: createLogger() },
        DEFAULT_CONFIG,
      );
      const orig = LobsterCodeAnalyzer.prototype.analyzeProject;
      (LobsterCodeAnalyzer.prototype as any).analyzeProject = async () => {
        throw new Error("forced analysis failure");
      };
      try {
        const result = await mgr.analyzeCodebase({
          workspaceDir: "/any/path",
        } as any);
        assert.ok(typeof result === "string" && result.length > 0);
      } finally {
        (LobsterCodeAnalyzer.prototype as any).analyzeProject = orig;
      }
    });
  });

  describe("formatAnalysisResult（via as any）", () => {
    it("有问题时输出问题分类，有建议时输出改进建议", () => {
      const mgr = new CodeAnalysisManager(
        { logger: createLogger() },
        DEFAULT_CONFIG,
      );
      const mockReport = {
        files: [
          {
            filePath: "a.ts",
            issues: [],
            linesOfCode: 100,
            functionCount: 3,
            complexityScore: 50,
          },
        ],
        totalIssues: 2,
        issuesByType: { complexity: 1, naming: 1 } as Record<string, number>,
        issuesBySeverity: {} as Record<string, number>,
        overallScore: 80,
        suggestions: ["减少函数复杂度", "改善命名"],
      };
      const result = (mgr as any).formatAnalysisResult(mockReport) as string;
      assert.ok(result.includes("问题分类:"));
      assert.ok(result.includes("complexity: 1"));
      assert.ok(result.includes("改进建议:"));
      assert.ok(result.includes("减少函数复杂度"));
    });

    it("无问题无建议时不含分类/建议章节", () => {
      const mgr = new CodeAnalysisManager(
        { logger: createLogger() },
        DEFAULT_CONFIG,
      );
      const mockReport = {
        files: [
          {
            filePath: "b.ts",
            issues: [],
            linesOfCode: 50,
            functionCount: 0,
            complexityScore: 100,
          },
        ],
        totalIssues: 0,
        issuesByType: {} as Record<string, number>,
        issuesBySeverity: {} as Record<string, number>,
        overallScore: 100,
        suggestions: [],
      };
      const result = (mgr as any).formatAnalysisResult(mockReport) as string;
      assert.ok(!result.includes("问题分类:"));
      assert.ok(!result.includes("改进建议:"));
    });
  });
});
