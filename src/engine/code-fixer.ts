/**
 * 🦞 龙虾代码自动修复器
 *
 * 基于 TypeScript Compiler API 的自动化代码修复工具。
 * 使用 AST 操作安全地应用代码修复。
 *
 * @remarks
 * 修复策略：
 * - 保守优先：只修复明确的问题
 * - 备份机制：修复前自动备份
 * - 可回滚：修复失败可恢复
 *
 * @see {@link https://kimmo.blog/posts/8-ast-based-refactoring-with-ts-morph/ | AST-based refactoring with ts-morph}
 * @see {@link https://www.alibabacloud.com/blog/code-problem-fixing-based-on-ast | Code Problem Fixing Based on AST}
 */

import ts from "typescript";
import fs from "fs/promises";
import path from "path";

/**
 * 修复类型
 */
export enum FixType {
  /** 移除 console.log */
  REMOVE_CONSOLE_LOG = "remove_console_log",
  /** 修复空 catch 块 */
  FIX_EMPTY_CATCH = "fix_empty_catch",
  /** 添加错误处理 */
  ADD_ERROR_HANDLING = "add_error_handling",
  /** 简化复杂函数 */
  SIMPLIFY_COMPLEX_FUNCTION = "simplify_complex_function",
  /** 移除 any 类型 */
  REMOVE_ANY_TYPE = "remove_any_type",
}

/**
 * 修复结果
 */
export interface FixResult {
  /** 修复类型 */
  type: FixType;
  /** 文件路径 */
  filePath: string;
  /** 是否成功 */
  success: boolean;
  /** 修复前代码 */
  beforeCode?: string;
  /** 修复后代码 */
  afterCode?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 批量修复报告
 */
export interface FixReport {
  /** 处理的文件数 */
  filesProcessed: number;
  /** 成功修复数 */
  fixesApplied: number;
  /** 失败修复数 */
  fixesFailed: number;
  /** 详细结果 */
  results: FixResult[];
}

/**
 * 修复器配置
 */
export interface FixerConfig {
  /** 是否备份原文件 */
  backup: boolean;
  /** 备份目录 */
  backupDir: string;
  /** 启用的修复类型 */
  enabledFixes: FixType[];
}

/**
 * 默认配置
 */
export const DEFAULT_FIXER_CONFIG: FixerConfig = {
  backup: true,
  backupDir: ".lobster-backup",
  enabledFixes: [
    FixType.REMOVE_CONSOLE_LOG,
    FixType.FIX_EMPTY_CATCH,
    FixType.ADD_ERROR_HANDLING,
    FixType.REMOVE_ANY_TYPE,
  ],
};

/**
 * 龙虾代码自动修复器类
 */
export class LobsterCodeFixer {
  private config: FixerConfig;

  constructor(config: Partial<FixerConfig> = {}) {
    this.config = { ...DEFAULT_FIXER_CONFIG, ...config };
  }

  /**
   * 修复项目中的代码问题
   *
   * @param projectPath 项目根目录
   * @returns Promise<FixReport> 修复报告
   */
  async fixProject(projectPath: string): Promise<FixReport> {
    const sourceFiles = await this.getSourceFiles(projectPath);
    const results: FixResult[] = [];

    for (const filePath of sourceFiles) {
      const fileResults = await this.fixFile(filePath);
      results.push(...fileResults);
    }

    return {
      filesProcessed: sourceFiles.length,
      fixesApplied: results.filter((r) => r.success).length,
      fixesFailed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * 修复单个文件
   */
  private async fixFile(filePath: string): Promise<FixResult[]> {
    const results: FixResult[] = [];

    try {
      // 读取文件内容
      const sourceCode = await fs.readFile(filePath, "utf-8");

      // 创建 AST
      const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
      );

      // 备份原文件
      if (this.config.backup) {
        await this.backupFile(filePath, sourceCode);
      }

      // 应用修复
      let modifiedCode = sourceCode;
      const printer = ts.createPrinter();

      // 收集需要修复的节点（反向遍历，从后往前修复避免位置偏移）
      const fixes: Array<{
        node: ts.Node;
        type: FixType;
        range: [number, number];
      }> = [];

      const collectFixes = (node: ts.Node) => {
        // 检测 console.log
        if (this.config.enabledFixes.includes(FixType.REMOVE_CONSOLE_LOG)) {
          if (this.isConsoleLog(node)) {
            const start = node.getStart(sourceFile);
            const end = node.getEnd();
            fixes.push({
              node,
              type: FixType.REMOVE_CONSOLE_LOG,
              range: [start, end],
            });
          }
        }

        // 检测空 catch 块
        if (this.config.enabledFixes.includes(FixType.FIX_EMPTY_CATCH)) {
          const emptyCatch = this.isEmptyCatchBlock(node);
          if (emptyCatch) {
            const start = node.getStart(sourceFile);
            const end = node.getEnd();
            fixes.push({
              node,
              type: FixType.FIX_EMPTY_CATCH,
              range: [start, end],
            });
          }
        }

        // 检测 any 类型
        if (this.config.enabledFixes.includes(FixType.REMOVE_ANY_TYPE)) {
          if (this.isAnyType(node)) {
            const start = node.getStart(sourceFile);
            const end = node.getEnd();
            fixes.push({
              node,
              type: FixType.REMOVE_ANY_TYPE,
              range: [start, end],
            });
          }
        }

        ts.forEachChild(node, collectFixes);
      };

      collectFixes(sourceFile);

      // 按位置排序（从后往前）
      fixes.sort((a, b) => b.range[0] - a.range[0]);

      // 应用修复
      for (const fix of fixes) {
        const fixResult = await this.applyFix(
          sourceFile,
          fix,
          modifiedCode,
          filePath,
        );
        results.push(fixResult);
        if (fixResult.success && fixResult.afterCode) {
          modifiedCode = fixResult.afterCode;
        }
      }

      // 如果有修改，写入文件
      const successfulFixes = results.filter((r) => r.success);
      if (
        successfulFixes.length > 0 &&
        results.some((r) => r.afterCode !== undefined)
      ) {
        await fs.writeFile(filePath, modifiedCode, "utf-8");
      }
    } catch (error) {
      results.push({
        type: FixType.REMOVE_CONSOLE_LOG,
        filePath,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return results;
  }

  /**
   * 应用单个修复
   */
  private async applyFix(
    sourceFile: ts.SourceFile,
    fix: { node: ts.Node; type: FixType; range: [number, number] },
    sourceCode: string,
    filePath: string,
  ): Promise<FixResult> {
    const beforeCode = sourceCode.substring(fix.range[0], fix.range[1]);
    let afterCode = beforeCode;

    try {
      switch (fix.type) {
        case FixType.REMOVE_CONSOLE_LOG:
          // 移除整行
          afterCode = "";
          break;

        case FixType.FIX_EMPTY_CATCH:
          // 在空 catch 块中添加日志
          afterCode = this.fixEmptyCatchBlock(beforeCode);
          break;

        case FixType.REMOVE_ANY_TYPE:
          // 将 any 替换为 unknown
          afterCode = beforeCode.replace(/\bany\b/g, "unknown");
          break;

        default:
          return {
            type: fix.type,
            filePath,
            success: false,
            error: `Unknown fix type: ${fix.type}`,
          };
      }

      // 构建新的完整代码
      const newSourceCode =
        sourceCode.substring(0, fix.range[0]) +
        afterCode +
        sourceCode.substring(fix.range[1]);

      return {
        type: fix.type,
        filePath,
        success: true,
        beforeCode,
        afterCode: newSourceCode,
      };
    } catch (error) {
      return {
        type: fix.type,
        filePath,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 检测是否为 console.log 调用
   */
  private isConsoleLog(node: ts.Node): boolean {
    if (!ts.isCallExpression(node)) {
      return false;
    }

    if (!ts.isPropertyAccessExpression(node.expression)) {
      return false;
    }

    const expr = node.expression;
    return (
      expr.name.text === "log" &&
      ts.isIdentifier(expr.expression) &&
      expr.expression.text === "console"
    );
  }

  /**
   * 检测是否为空 catch 块
   */
  private isEmptyCatchBlock(node: ts.Node): boolean {
    if (!ts.isCatchClause(node)) {
      return false;
    }

    return node.block.statements.length === 0;
  }

  /**
   * 修复空 catch 块
   */
  private fixEmptyCatchBlock(catchBlockCode: string): string {
    // 在 catch 块中添加错误日志
    return catchBlockCode.replace(
      /\{\s*\}/,
      `{\n      // 记录错误日志\n      console.error('Error:', error);\n    }`,
    );
  }

  /**
   * 检测是否为 any 类型
   */
  private isAnyType(node: ts.Node): boolean {
    return (
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      node.typeName.text === "any"
    );
  }

  /**
   * 备份文件
   */
  private async backupFile(filePath: string, content: string): Promise<void> {
    const backupPath = path.join(
      this.config.backupDir,
      path.relative(process.cwd(), filePath),
    );

    // 确保备份目录存在
    await fs.mkdir(path.dirname(backupPath), { recursive: true });

    // 写入备份
    await fs.writeFile(backupPath, content, "utf-8");
  }

  /**
   * 获取源文件列表
   */
  private async getSourceFiles(projectPath: string): Promise<string[]> {
    const sourceFiles: string[] = [];

    async function scanDirectory(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (
            entry.isDirectory() &&
            !entry.name.startsWith(".") &&
            entry.name !== "node_modules"
          ) {
            await scanDirectory(fullPath);
          } else if (
            entry.isFile() &&
            (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
          ) {
            sourceFiles.push(fullPath);
          }
        }
      } catch {
        // 忽略无法访问的目录
      }
    }

    await scanDirectory(projectPath);
    return sourceFiles;
  }
}

/**
 * 快速修复入口函数
 *
 * @param projectPath 项目路径
 * @returns Promise<string> 修复结果摘要
 */
export async function quickFix(projectPath: string): Promise<string> {
  const fixer = new LobsterCodeFixer({
    backup: true,
    enabledFixes: [
      FixType.REMOVE_CONSOLE_LOG,
      FixType.FIX_EMPTY_CATCH,
      FixType.REMOVE_ANY_TYPE,
    ],
  });

  const report = await fixer.fixProject(projectPath);

  return `
🔧 代码自动修复报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 处理文件: ${report.filesProcessed}
✅ 成功修复: ${report.fixesApplied}
❌ 失败修复: ${report.fixesFailed}

修复详情:
${
  report.results
    .filter((r) => r.success)
    .map((r) => `  ✅ ${r.type}: ${r.filePath}`)
    .join("\n") || "  (无)"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}
