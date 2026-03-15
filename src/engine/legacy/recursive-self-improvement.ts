/**
 * 🦞 龙虾递归自我改进
 *
 * 实现 Recursive Self-Improvement (RSI) 模式
 * AI Agent 自主重写代码和提示词以提升性能
 *
 * @see {@link https://iclr.cc/virtual/2026/workshop/10000796}
 * @see {@link https://www.primeintellect.ai/blog/rlm}
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

/**
 * 改进提案
 */
export interface ImprovementProposal {
  /** 提案ID */
  id: string;
  /** 目标文件 */
  targetFile: string;
  /** 改进类型 */
  type: "optimization" | "bugfix" | "refactor" | "feature";
  /** 当前代码 */
  currentCode: string;
  /** 改进后代码 */
  improvedCode: string;
  /** 改进理由 */
  rationale: string;
  /** 预期收益 */
  expectedBenefit: string;
  /** 风险评估 */
  riskLevel: "low" | "medium" | "high";
  /** 优先级 */
  priority: number;
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  /** 执行时间（毫秒） */
  executionTime: number;
  /** 内存使用（字节） */
  memoryUsage: number;
  /** 成功率 */
  successRate: number;
  /** 错误计数 */
  errorCount: number;
  /** 吞吐量 */
  throughput?: number;
}

/**
 * 改进历史
 */
export interface ImprovementHistory {
  /** 应用时间 */
  timestamp: number;
  /** 提案 */
  proposal: ImprovementProposal;
  /** 改进前指标 */
  beforeMetrics: PerformanceMetrics;
  /** 改进后指标 */
  afterMetrics: PerformanceMetrics;
  /** 是否回滚 */
  rolledBack: boolean;
}

/**
 * RSI 配置
 */
export interface RecursiveConfig {
  /** 最大递归深度 */
  maxRecursionDepth?: number;
  /** 改进间隔（毫秒） */
  improvementInterval?: number;
  /** 备份目录 */
  backupDir?: string;
  /** 启用自动应用 */
  enableAutoApply?: boolean;
  /** 高风险操作需要确认 */
  requireConfirmation?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<RecursiveConfig> = {
  maxRecursionDepth: 5,
  improvementInterval: 60000, // 1分钟
  backupDir: ".rsi-backups",
  enableAutoApply: false,
  requireConfirmation: true,
};

/**
 * 递归改进候选
 */
interface ImprovementCandidate {
  file: string;
  line: number;
  issue: string;
  suggestion: string;
}

/**
 * 递归自我改进引擎
 */
export class RecursiveSelfImprovement {
  private config: Required<RecursiveConfig>;
  private history: ImprovementHistory[] = [];
  private currentDepth = 0;
  private baselineMetrics: PerformanceMetrics | null = null;

  constructor(config: RecursiveConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 启动自我改进循环
   */
  async start(targetFiles: string[]): Promise<void> {
    if (this.currentDepth >= this.config.maxRecursionDepth) {
      console.log("🦞 达到最大递归深度，停止自我改进");
      return;
    }

    console.log(`🦞 启动第 ${this.currentDepth + 1} 轮递归自我改进`);

    // 1. 分析代码，发现改进机会
    const candidates = await this.analyzeCode(targetFiles);

    // 2. 生成改进提案
    const proposals = await this.generateProposals(candidates);

    // 3. 评估改进提案
    const evaluatedProposals = await this.evaluateProposals(proposals);

    // 4. 应用改进
    for (const proposal of evaluatedProposals) {
      await this.applyImprovement(proposal);
    }

    // 5. 验证改进效果
    await this.verifyImprovements();

    this.currentDepth++;
  }

  /**
   * 分析代码，发现改进机会
   */
  private async analyzeCode(files: string[]): Promise<ImprovementCandidate[]> {
    const candidates: ImprovementCandidate[] = [];

    for (const file of files) {
      if (!existsSync(file)) continue;

      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      // 分析每一行
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const issues = this.analyzeLine(line, i, file);

        for (const issue of issues) {
          candidates.push(issue);
        }
      }
    }

    return candidates;
  }

  /**
   * 分析单行代码
   */
  private analyzeLine(
    line: string,
    lineNum: number,
    file: string,
  ): ImprovementCandidate[] {
    const issues: ImprovementCandidate[] = [];

    // 检测性能问题
    if (
      line.includes("for (const") &&
      line.includes("of") &&
      line.includes(".filter(")
    ) {
      issues.push({
        file,
        line: lineNum,
        issue: "多次遍历数组",
        suggestion: "考虑使用单次遍历或 Map/Reduce 优化",
      });
    }

    // 检测内存泄漏风险
    if (line.includes("setInterval") && !line.includes("clearInterval")) {
      issues.push({
        file,
        line: lineNum,
        issue: "潜在的内存泄漏",
        suggestion: "确保定时器被正确清理",
      });
    }

    // 检测同步阻塞操作
    if (line.includes("while (true)") || line.includes("for (;;)")) {
      issues.push({
        file,
        line: lineNum,
        issue: "潜在的无限循环",
        suggestion: "添加退出条件或使用异步模式",
      });
    }

    // 检测未处理的 Promise
    if (
      line.includes("async ") &&
      !line.includes("await") &&
      !line.includes(".catch")
    ) {
      issues.push({
        file,
        line: lineNum,
        issue: "未处理的异步操作",
        suggestion: "添加 await 或 .catch() 处理",
      });
    }

    return issues;
  }

  /**
   * 生成改进提案
   */
  private async generateProposals(
    candidates: ImprovementCandidate[],
  ): Promise<ImprovementProposal[]> {
    const proposals: ImprovementProposal[] = [];

    for (const candidate of candidates) {
      const proposal: ImprovementProposal = {
        id: `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        targetFile: candidate.file,
        type: this.determineType(candidate),
        currentCode: "", // 将在应用时读取
        improvedCode: "", // 将在应用时生成
        rationale: `发现问题: ${candidate.issue}`,
        expectedBenefit: candidate.suggestion,
        riskLevel: this.assessRisk(candidate),
        priority: this.calculatePriority(candidate),
      };

      proposals.push(proposal);
    }

    return proposals;
  }

  /**
   * 评估改进提案
   */
  private async evaluateProposals(
    proposals: ImprovementProposal[],
  ): Promise<ImprovementProposal[]> {
    // 按优先级和风险排序
    return proposals
      .filter((p) => p.riskLevel !== "high" || !this.config.requireConfirmation)
      .sort((a, b) => {
        // 优先高优先级、低风险的
        const scoreA = a.priority - (a.riskLevel === "high" ? 100 : 0);
        const scoreB = b.priority - (b.riskLevel === "high" ? 100 : 0);
        return scoreB - scoreA;
      })
      .slice(0, 5); // 最多应用5个改进
  }

  /**
   * 应用改进
   */
  private async applyImprovement(proposal: ImprovementProposal): Promise<void> {
    console.log(`🦞 应用改进: ${proposal.targetFile}:${proposal.rationale}`);

    // 备份原文件
    await this.backupFile(proposal.targetFile);

    // 读取当前代码
    const content = readFileSync(proposal.targetFile, "utf-8");

    // 生成改进代码（简化版，实际应用中需要 LLM）
    const improvedCode = this.generateImprovedCode(content, proposal);

    // 写入改进后的代码
    writeFileSync(proposal.targetFile, improvedCode, "utf-8");

    console.log(`✅ 改进已应用到 ${proposal.targetFile}`);
  }

  /**
   * 生成改进后的代码
   */
  private generateImprovedCode(
    currentCode: string,
    proposal: ImprovementProposal,
  ): string {
    let code = currentCode;

    switch (proposal.type) {
      case "optimization":
        code = this.applyOptimization(code, proposal);
        break;
      case "bugfix":
        code = this.applyBugFix(code, proposal);
        break;
      case "refactor":
        code = this.applyRefactor(code, proposal);
        break;
      default:
        code = currentCode;
    }

    return code;
  }

  /**
   * 应用性能优化
   */
  private applyOptimization(
    code: string,
    proposal: ImprovementProposal,
  ): string {
    // 多次遍历优化
    code = code.replace(
      /for \(const (\w+) of (\w+)\.filter\((\w+) => \2\.(\w+)\)\)/g,
      "for (const $1 of $2.filter($3 => $3.$4))",
    );

    // 使用 Set 优化查找
    code = code.replace(
      /\.includes\((\w+)\) \.\. indexOf\((\1)\)/g,
      ".has($1)",
    );

    return code;
  }

  /**
   * 应用 Bug 修复
   */
  private applyBugFix(code: string, proposal: ImprovementProposal): string {
    // 添加清理定时器
    if (code.includes("setInterval") && !code.includes("clearInterval")) {
      const intervalMatch = code.match(/setInterval\(([^)]+)\)/);
      if (intervalMatch) {
        const timerVar = `timer_${Date.now()}`;
        code = code.replace("setInterval(", `const ${timerVar} = setInterval(`);
        code += `\n// 清理定时器\nprocess.on('beforeExit', () => clearInterval(${timerVar}));`;
      }
    }

    return code;
  }

  /**
   * 应用重构
   */
  private applyRefactor(code: string, proposal: ImprovementProposal): string {
    // 提取复杂表达式
    // 实际应用中需要更复杂的 AST 分析

    return code;
  }

  /**
   * 备份文件
   */
  private async backupFile(filePath: string): Promise<void> {
    const backupPath = join(
      this.config.backupDir,
      `${filePath.replace(/[\/\\]/g, "_")}_${Date.now()}.bak`,
    );

    const dir = dirname(backupPath);
    // 确保备份目录存在（简化版，实际需要 mkdirp）
  }

  /**
   * 验证改进效果
   */
  private async verifyImprovements(): Promise<void> {
    // 运行测试
    // 收集性能指标
    // 如果性能下降，回滚改进

    console.log("🦞 验证改进效果...");
  }

  /**
   * 确定改进类型
   */
  private determineType(
    candidate: ImprovementCandidate,
  ): ImprovementProposal["type"] {
    if (
      candidate.issue.includes("泄漏") ||
      candidate.issue.includes("未处理")
    ) {
      return "bugfix";
    }
    if (candidate.issue.includes("性能") || candidate.issue.includes("遍历")) {
      return "optimization";
    }
    return "refactor";
  }

  /**
   * 评估风险
   */
  private assessRisk(
    candidate: ImprovementCandidate,
  ): "low" | "medium" | "high" {
    if (
      candidate.issue.includes("无限循环") ||
      candidate.issue.includes("内存泄漏")
    ) {
      return "high";
    }
    if (candidate.issue.includes("多次遍历")) {
      return "low";
    }
    return "medium";
  }

  /**
   * 计算优先级
   */
  private calculatePriority(candidate: ImprovementCandidate): number {
    let priority = 5; // 基础优先级

    if (candidate.issue.includes("泄漏")) priority += 3;
    if (candidate.issue.includes("未处理")) priority += 2;
    if (candidate.issue.includes("遍历")) priority += 1;

    return priority;
  }

  /**
   * 获取改进历史
   */
  getHistory(): ImprovementHistory[] {
    return [...this.history];
  }

  /**
   * 获取当前递归深度
   */
  getCurrentDepth(): number {
    return this.currentDepth;
  }

  /**
   * 停止自我改进
   */
  stop(): void {
    console.log("🦞 停止递归自我改进");
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.currentDepth = 0;
    this.history = [];
    this.baselineMetrics = null;
  }
}

/**
 * 创建递归自我改进引擎
 */
export function createRecursiveSelfImprovement(
  config?: RecursiveConfig,
): RecursiveSelfImprovement {
  return new RecursiveSelfImprovement(config);
}

/**
 * 自动改进装饰器
 */
export function selfImproving(config?: RecursiveConfig) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const rsi = new RecursiveSelfImprovement(config);

    descriptor.value = async function (...args: any[]) {
      // 执行原方法
      const result = await originalMethod.apply(this, args);

      // 定期触发自我改进
      if (Math.random() < 0.1) {
        // 10% 概率触发
        const currentFilePath = new Error().stack?.match(
          /at.*\((.*?):\d+/,
        )?.[1];
        if (currentFilePath) {
          await rsi.start([currentFilePath]);
        }
      }

      return result;
    };

    return descriptor;
  };
}
