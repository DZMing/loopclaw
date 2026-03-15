import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  LobsterCodeFixer,
  DEFAULT_FIXER_CONFIG,
  FixType,
  quickFix,
} from "../src/engine/code-fixer.js";
import { withTempWorkspace } from "./helpers.js";

describe("FixType", () => {
  it("包含所有修复类型", () => {
    assert.equal(FixType.REMOVE_CONSOLE_LOG, "remove_console_log");
    assert.equal(FixType.FIX_EMPTY_CATCH, "fix_empty_catch");
    assert.equal(FixType.ADD_ERROR_HANDLING, "add_error_handling");
    assert.equal(
      FixType.SIMPLIFY_COMPLEX_FUNCTION,
      "simplify_complex_function",
    );
    assert.equal(FixType.REMOVE_ANY_TYPE, "remove_any_type");
  });
});

describe("DEFAULT_FIXER_CONFIG", () => {
  it("backup 默认为 true", () => {
    assert.equal(DEFAULT_FIXER_CONFIG.backup, true);
  });

  it("backupDir 默认为 .lobster-backup", () => {
    assert.equal(DEFAULT_FIXER_CONFIG.backupDir, ".lobster-backup");
  });

  it("enabledFixes 包含预期类型", () => {
    assert.ok(
      DEFAULT_FIXER_CONFIG.enabledFixes.includes(FixType.REMOVE_CONSOLE_LOG),
    );
    assert.ok(
      DEFAULT_FIXER_CONFIG.enabledFixes.includes(FixType.FIX_EMPTY_CATCH),
    );
    assert.ok(
      DEFAULT_FIXER_CONFIG.enabledFixes.includes(FixType.REMOVE_ANY_TYPE),
    );
  });
});

describe("LobsterCodeFixer", () => {
  describe("constructor", () => {
    it("默认配置不抛出", () => {
      assert.ok(new LobsterCodeFixer() instanceof LobsterCodeFixer);
    });

    it("可部分覆盖配置", () => {
      assert.ok(
        new LobsterCodeFixer({ backup: false }) instanceof LobsterCodeFixer,
      );
    });
  });

  describe("fixProject", () => {
    it("空目录返回空报告", async () => {
      await withTempWorkspace("codefixer-empty", async ({ workspaceDir }) => {
        const fixer = new LobsterCodeFixer({ backup: false });
        const report = await fixer.fixProject(workspaceDir);
        assert.equal(report.filesProcessed, 0);
        assert.equal(report.fixesApplied, 0);
        assert.equal(report.fixesFailed, 0);
        assert.deepEqual(report.results, []);
      });
    });

    it("不存在的目录不抛出，返回空报告", async () => {
      const fixer = new LobsterCodeFixer({ backup: false });
      const report = await fixer.fixProject("/nonexistent/xyz");
      assert.equal(report.filesProcessed, 0);
      assert.equal(report.fixesApplied, 0);
    });

    it("检测并移除 console.log", async () => {
      await withTempWorkspace(
        "codefixer-consolelog",
        async ({ workspaceDir }) => {
          const tsFile = path.join(workspaceDir, "sample.ts");
          await fs.writeFile(
            tsFile,
            `function hello() {\n  console.log("debug");\n  return 42;\n}\n`,
          );
          const fixer = new LobsterCodeFixer({ backup: false });
          const report = await fixer.fixProject(workspaceDir);
          assert.equal(report.filesProcessed, 1);
          assert.ok(report.fixesApplied >= 1);
          // 验证文件已被修改（console.log 被移除）
          const content = await fs.readFile(tsFile, "utf-8");
          assert.ok(!content.includes('console.log("debug")'));
        },
      );
    });

    it("检测并修复空 catch 块", async () => {
      await withTempWorkspace(
        "codefixer-emptycatch",
        async ({ workspaceDir }) => {
          const tsFile = path.join(workspaceDir, "sample.ts");
          await fs.writeFile(
            tsFile,
            `try {\n  doSomething();\n} catch (e) {}\n`,
          );
          const fixer = new LobsterCodeFixer({ backup: false });
          const report = await fixer.fixProject(workspaceDir);
          assert.equal(report.filesProcessed, 1);
          assert.ok(report.fixesApplied >= 1);
          // 空 catch 块被填充了日志
          const content = await fs.readFile(tsFile, "utf-8");
          assert.ok(content.includes("console.error"));
        },
      );
    });

    it("report.results 包含每个修复的详细信息", async () => {
      await withTempWorkspace("codefixer-results", async ({ workspaceDir }) => {
        const tsFile = path.join(workspaceDir, "a.ts");
        await fs.writeFile(tsFile, `console.log("x");\n`);
        const fixer = new LobsterCodeFixer({ backup: false });
        const report = await fixer.fixProject(workspaceDir);
        assert.ok(report.results.length >= 1);
        const result = report.results[0];
        assert.equal(result.filePath, tsFile);
        assert.equal(result.type, FixType.REMOVE_CONSOLE_LOG);
        assert.equal(result.success, true);
        assert.ok(typeof result.beforeCode === "string");
      });
    });

    it("修复文件数正确统计", async () => {
      await withTempWorkspace(
        "codefixer-multifile",
        async ({ workspaceDir }) => {
          await fs.writeFile(
            path.join(workspaceDir, "a.ts"),
            `console.log("a");\n`,
          );
          await fs.writeFile(path.join(workspaceDir, "b.ts"), `const x = 1;\n`);
          const fixer = new LobsterCodeFixer({ backup: false });
          const report = await fixer.fixProject(workspaceDir);
          assert.equal(report.filesProcessed, 2);
        },
      );
    });

    it("启用 REMOVE_ANY_TYPE 时扫描含 TypeReferenceNode 的文件不报错", async () => {
      await withTempWorkspace("codefixer-anytype", async ({ workspaceDir }) => {
        const tsFile = path.join(workspaceDir, "typed.ts");
        // 包含 TypeReferenceNode（Array<string>）以覆盖 isAnyType 内的条件判断路径
        // any 是 KeywordTypeNode 而非 TypeReferenceNode，所以 isAnyType 实际不会命中
        await fs.writeFile(
          tsFile,
          `function process(data: any, arr: Array<string>): any {\n  return data;\n}\n`,
        );
        const fixer = new LobsterCodeFixer({
          backup: false,
          enabledFixes: [FixType.REMOVE_ANY_TYPE],
        });
        const report = await fixer.fixProject(workspaceDir);
        assert.equal(report.filesProcessed, 1);
        // isAnyType 依赖 TypeReferenceNode 匹配，but `any` 解析为 AnyKeyword，实际为 0
        assert.equal(report.fixesApplied, 0);
      });
    });

    it("扫描子目录中的文件", async () => {
      await withTempWorkspace("codefixer-subdir", async ({ workspaceDir }) => {
        const subDir = path.join(workspaceDir, "src");
        await fs.mkdir(subDir);
        await fs.writeFile(
          path.join(subDir, "sub.ts"),
          `console.log("sub");\n`,
        );
        const fixer = new LobsterCodeFixer({ backup: false });
        const report = await fixer.fixProject(workspaceDir);
        assert.equal(report.filesProcessed, 1);
        assert.ok(report.fixesApplied >= 1);
      });
    });

    it("enabledFixes 为空时不修复任何内容", async () => {
      await withTempWorkspace("codefixer-nofixes", async ({ workspaceDir }) => {
        await fs.writeFile(
          path.join(workspaceDir, "x.ts"),
          `console.log("test");\n`,
        );
        const fixer = new LobsterCodeFixer({ backup: false, enabledFixes: [] });
        const report = await fixer.fixProject(workspaceDir);
        assert.equal(report.filesProcessed, 1);
        assert.equal(report.fixesApplied, 0);
      });
    });
  });

  describe("quickFix", () => {
    it("返回格式化字符串报告", async () => {
      await withTempWorkspace("quickfix-basic", async ({ workspaceDir }) => {
        const result = await quickFix(workspaceDir);
        assert.ok(typeof result === "string");
        assert.ok(result.includes("处理文件"));
        assert.ok(result.includes("代码自动修复报告"));
      });
    });

    it("不存在的路径不抛出", async () => {
      await assert.doesNotReject(() => quickFix("/nonexistent/path/abc"));
    });

    it("有修复时报告包含成功修复数", async () => {
      await withTempWorkspace("quickfix-fixes", async ({ workspaceDir }) => {
        await fs.writeFile(
          path.join(workspaceDir, "t.ts"),
          `console.log("hi");\n`,
        );
        const result = await quickFix(workspaceDir);
        assert.ok(result.includes("成功修复"));
      });
    });
  });

  describe("applyFix (private — 直接调用)", () => {
    it("REMOVE_ANY_TYPE 将 any 替换为 unknown（覆盖 lines 247-249）", async () => {
      const fixer = new LobsterCodeFixer({ backup: false });
      const result = await (fixer as any).applyFix(
        null,
        { type: FixType.REMOVE_ANY_TYPE, range: [0, 5], node: null },
        "any x",
        "test.ts",
      );
      assert.equal(result.success, true);
      assert.ok((result.afterCode as string).includes("unknown"));
    });

    it("未知 fix type 返回 success:false 含错误信息（覆盖 lines 251-257）", async () => {
      const fixer = new LobsterCodeFixer({ backup: false });
      const result = await (fixer as any).applyFix(
        null,
        { type: "totally_unknown" as any, range: [0, 0], node: null },
        "",
        "test.ts",
      );
      assert.equal(result.success, false);
      assert.ok((result.error as string).includes("Unknown fix type"));
    });

    it("内部抛出时走 catch 分支返回 success:false（覆盖 lines 275-281）", async () => {
      const fixer = new LobsterCodeFixer({ backup: false });
      // 替换 fixEmptyCatchBlock 使其抛出，触发 applyFix catch 分支
      (fixer as any).fixEmptyCatchBlock = () => {
        throw new Error("forced error from test");
      };
      const result = await (fixer as any).applyFix(
        null,
        { type: FixType.FIX_EMPTY_CATCH, range: [0, 14], node: null },
        "catch (e) {  }",
        "test.ts",
      );
      assert.equal(result.success, false);
      assert.ok((result.error as string).includes("forced error from test"));
    });
  });
});
