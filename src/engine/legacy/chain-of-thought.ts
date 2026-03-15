/**
 * 🦞 龙虾思维链推理框架
 *
 * 实现 Chain of Thought (CoT) 推理框架
 * 基于 2026 AI Agent 最佳实践
 *
 * @see {@link https://www.promptingguide.ai/techniques/cot}
 * @see {@link https://github.com/LightChen233/Awesome-Long-Chain-of-Thought-Reasoning}
 */

/**
 * 思维步骤
 */
export interface ThoughtStep {
  /** 步骤ID */
  id: string;
  /** 思考内容 */
  thought: string;
  /** 行动 */
  action?: string;
  /** 观察结果 */
  observation?: string;
  /** 置信度 */
  confidence?: number;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 推理状态
 */
export enum ReasoningState {
  /** 分析中 */
  ANALYZING = "analyzing",
  /** 假设生成 */
  HYPOTHESIZING = "hypothesizing",
  /** 验证中 */
  VERIFYING = "verifying",
  /** 完成 */
  COMPLETED = "completed",
  /** 失败 */
  FAILED = "failed",
}

/**
 * 推理配置
 */
export interface ChainConfig {
  /** 最大推理步骤 */
  maxSteps?: number;
  /** 启用自我验证 */
  enableSelfVerification?: boolean;
  /** 启用思维链可视化 */
  enableVisualization?: boolean;
  /** 置信度阈值 */
  confidenceThreshold?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<ChainConfig> = {
  maxSteps: 10,
  enableSelfVerification: true,
  enableVisualization: true,
  confidenceThreshold: 0.7,
};

/**
 * 推理结果
 */
export interface ReasoningResult {
  /** 最终答案 */
  answer: string;
  /** 思维链 */
  chain: ThoughtStep[];
  /** 置信度 */
  confidence: number;
  /** 状态 */
  state: ReasoningState;
  /** 元数据 */
  metadata?: {
    totalDuration: number;
    totalSteps: number;
    verificationPassed?: boolean;
    totalBranches?: number;
    consistencyScore?: number;
    actualDepth?: number;
    graphNodes?: number;
    improvementHistory?: string[];
  };
}

/**
 * 思维链推理器
 */
export class ChainOfThought {
  protected config: Required<ChainConfig>;
  protected chain: ThoughtStep[] = [];
  protected currentState: ReasoningState = ReasoningState.ANALYZING;

  constructor(config: ChainConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 执行推理
   */
  async reason(question: string, context?: string): Promise<ReasoningResult> {
    const startTime = Date.now();

    this.chain = [];
    this.currentState = ReasoningState.ANALYZING;

    // 步骤1: 分析问题
    await this.analyze(question, context);

    // 步骤2: 生成假设
    await this.generateHypothesis(question, context);

    // 步骤3: 验证假设
    if (this.config.enableSelfVerification) {
      await this.verifyHypothesis(question, context);
    }

    // 步骤4: 生成最终答案
    const result = await this.generateAnswer(question, context);

    this.currentState = ReasoningState.COMPLETED;

    return {
      answer: result.answer,
      chain: this.chain,
      confidence: result.confidence,
      state: this.currentState,
      metadata: {
        totalDuration: Date.now() - startTime,
        totalSteps: this.chain.length,
        verificationPassed: result.verificationPassed,
      },
    };
  }

  /**
   * 分析问题
   */
  private async analyze(
    question: string,
    context: string | undefined,
  ): Promise<void> {
    this.addStep("分析问题", `问题: ${question}`);

    if (context) {
      this.addStep("上下文分析", `已有信息: ${context}`);
    }

    // 识别问题类型
    const problemType = this.identifyProblemType(question);
    this.addStep("问题分类", `类型: ${problemType}`);

    this.currentState = ReasoningState.HYPOTHESIZING;
  }

  /**
   * 生成假设
   */
  private async generateHypothesis(
    question: string,
    context: string | undefined,
  ): Promise<void> {
    this.addStep("生成假设", "基于问题分析，形成初步假设");

    // 分解问题
    const subQuestions = this.decomposeQuestion(question);
    for (const sub of subQuestions) {
      this.addStep("子问题分析", sub);
    }

    // 生成解决方案
    this.addStep("方案设计", "基于子问题分析，设计解决方案");
  }

  /**
   * 验证假设
   */
  private async verifyHypothesis(
    question: string,
    context: string | undefined,
  ): Promise<void> {
    this.currentState = ReasoningState.VERIFYING;
    this.addStep("开始验证", "检查假设的合理性和可行性");

    // 自我质疑
    const critiques = this.selfCritique();
    for (const critique of critiques) {
      this.addStep("自我质疑", critique);
    }

    // 修正假设
    if (critiques.length > 0) {
      this.addStep("修正方案", "基于质疑结果，修正解决方案");
    }

    // 最终验证
    const verification = this.verifySolution();
    this.addStep("验证完成", verification);
  }

  /**
   * 生成答案
   */
  private async generateAnswer(
    question: string,
    context: string | undefined,
  ): Promise<{
    answer: string;
    confidence: number;
    verificationPassed: boolean;
  }> {
    // 综合思维链生成答案
    const answer = this.synthesizeAnswer();
    const confidence = this.calculateConfidence();

    // 检查验证是否通过
    const verificationPassed = this.checkVerificationPassed();

    return {
      answer,
      confidence,
      verificationPassed,
    };
  }

  /**
   * 添加思维步骤
   */
  protected addStep(action: string, thought: string): void {
    const step: ThoughtStep = {
      id: `step_${Date.now()}_${this.chain.length}`,
      thought: `${action}: ${thought}`,
      action,
      timestamp: Date.now(),
    };

    this.chain.push(step);

    if (this.config.enableVisualization) {
      console.log(`🧠 ${step.thought}`);
    }
  }

  /**
   * 识别问题类型
   */
  private identifyProblemType(question: string): string {
    if (question.includes("如何") || question.includes("怎么做")) {
      return "操作型问题";
    }
    if (question.includes("为什么") || question.includes("原因")) {
      return "解释型问题";
    }
    if (question.includes("是什么") || question.includes("定义")) {
      return "定义型问题";
    }
    if (question.includes("比较") || question.includes("区别")) {
      return "比较型问题";
    }
    return "通用型问题";
  }

  /**
   * 分解问题
   */
  private decomposeQuestion(question: string): string[] {
    // 简化的问题分解（实际应用中需要 LLM）
    const parts: string[] = [];

    if (question.includes("和")) {
      const subQuestions = question.split("和");
      for (const sq of subQuestions) {
        parts.push(sq.trim() + "?");
      }
    } else {
      // 生成子问题
      parts.push(`问题1: ${question} 的背景是什么?`);
      parts.push(`问题2: ${question} 的关键因素有哪些?`);
      parts.push(`问题3: 如何解决 ${question}?`);
    }

    return parts.slice(0, 3); // 最多3个子问题
  }

  /**
   * 自我质疑
   */
  private selfCritique(): string[] {
    const critiques: string[] = [];

    // 检查思维链中的潜在问题
    for (let i = 1; i < this.chain.length; i++) {
      const step = this.chain[i];

      // 检查逻辑跳跃
      if (i > 0 && this.chain[i - 1].action === "方案设计") {
        critiques.push(`步骤 ${i}: 缺少方案设计的详细说明`);
      }

      // 检查假设验证
      if (step.action === "修正方案" && i < this.chain.length - 1) {
        critiques.push(`步骤 ${i}: 修正方案未经验证`);
      }
    }

    return critiques;
  }

  /**
   * 验证解决方案
   */
  private verifySolution(): string {
    // 检查解决方案的完整性
    const hasAnalysis = this.chain.some((s) => s.action === "分析问题");
    const hasHypothesis = this.chain.some((s) => s.action === "生成假设");
    const hasVerification = this.chain.some((s) => s.action === "开始验证");

    if (!hasAnalysis) return "❌ 缺少问题分析";
    if (!hasHypothesis) return "❌ 缺少假设生成";
    if (!hasVerification) return "❌ 缺少假设验证";

    return "✅ 验证通过";
  }

  /**
   * 综合答案
   */
  private synthesizeAnswer(): string {
    // 从思维链中提取关键信息
    const keySteps = this.chain.filter(
      (s) =>
        s.action === "方案设计" ||
        s.action === "修正方案" ||
        s.action === "验证完成",
    );

    if (keySteps.length === 0) {
      return "基于分析，我需要更多信息来回答这个问题。";
    }

    // 最后一步通常是最终答案
    const lastStep = keySteps[keySteps.length - 1];
    return lastStep.thought.replace("验证完成: ", "");
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(): number {
    // 基于多个因素计算置信度
    let confidence = 0.5;

    // 步骤完整性
    const hasAllSteps = this.chain.length >= 4;
    if (hasAllSteps) confidence += 0.2;

    // 验证通过
    const hasVerification = this.chain.some(
      (s) => s.action === "验证完成" && s.thought.includes("✅"),
    );
    if (hasVerification) confidence += 0.2;

    // 没有自我质疑
    const hasCritiques = this.chain.some((s) => s.action === "自我质疑");
    if (!hasCritiques) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  /**
   * 检查验证是否通过
   */
  private checkVerificationPassed(): boolean {
    const verificationStep = this.chain.find((s) => s.action === "验证完成");
    return verificationStep?.thought.includes("✅") || false;
  }

  /**
   * 导出思维链
   */
  exportChain(): string {
    return this.chain
      .map((step, i) => `${i + 1}. ${step.action}\n   ${step.thought}`)
      .join("\n\n");
  }

  /**
   * 获取当前状态
   */
  getState(): ReasoningState {
    return this.currentState;
  }

  /**
   * 重置
   */
  reset(): void {
    this.chain = [];
    this.currentState = ReasoningState.ANALYZING;
  }
}

/**
 * 创建思维链推理器
 */
export function createChainOfThought(config?: ChainConfig): ChainOfThought {
  return new ChainOfThought(config);
}

/**
 * 树思维扩展（Graph-CoT）
 */
export class TreeOfThought extends ChainOfThought {
  private branches: Map<string, ThoughtStep[]> = new Map();

  /**
   * 执行树形推理
   */
  async reason(
    question: string,
    context?: string,
    maxBranches: number = 3,
  ): Promise<ReasoningResult> {
    const startTime = Date.now();

    // 基础推理
    const baseResult = await super.reason(question, context);

    // 生成多个分支假设
    const branches = await this.generateBranches(
      question,
      context,
      maxBranches,
    );

    // 评估每个分支
    const bestBranch = this.evaluateBranches(branches);

    return {
      ...baseResult,
      answer: bestBranch.finalAnswer,
      confidence: bestBranch.confidence,
      metadata: {
        totalDuration: baseResult.metadata?.totalDuration || 0,
        totalSteps: baseResult.metadata?.totalSteps || 0,
        verificationPassed: baseResult.metadata?.verificationPassed,
        totalBranches: branches.length,
      },
    };
  }

  /**
   * 生成分支假设
   */
  private async generateBranches(
    question: string,
    context: string | undefined,
    maxBranches: number,
  ): Promise<Array<{ steps: ThoughtStep[]; confidence: number }>> {
    const branches: Array<{ steps: ThoughtStep[]; confidence: number }> = [];

    // 生成不同角度的思考
    const perspectives = ["技术角度", "业务角度", "用户角度", "成本角度"];

    for (let i = 0; i < Math.min(maxBranches, perspectives.length); i++) {
      const branchSteps: ThoughtStep[] = [];

      branchSteps.push({
        id: `branch_${i}_0`,
        thought: `从${perspectives[i]}分析: ${question}`,
        timestamp: Date.now(),
      } as ThoughtStep);

      branchSteps.push({
        id: `branch_${i}_1`,
        thought: `应用${perspectives[i]}知识推导解决方案`,
        timestamp: Date.now(),
      } as ThoughtStep);

      branches.push({
        steps: branchSteps,
        confidence: Math.random() * 0.5 + 0.5, // 模拟置信度
      });
    }

    return branches;
  }

  /**
   * 评估分支
   */
  private evaluateBranches(
    branches: Array<{ steps: ThoughtStep[]; confidence: number }>,
  ): { finalAnswer: string; confidence: number } {
    // 选择置信度最高的分支
    const bestBranch = branches.reduce((best, current) =>
      current.confidence > best.confidence ? current : best,
    );

    const finalAnswer = bestBranch.steps[bestBranch.steps.length - 1].thought;

    return {
      finalAnswer,
      confidence: bestBranch.confidence,
    };
  }
}

/**
 * 创建树思维推理器
 */
export function createTreeOfThought(config?: ChainConfig): TreeOfThought {
  return new TreeOfThought(config);
}

/**
 * CoT 推理装饰器
 */
export function withCoT(description?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cot = createChainOfThought();

      // 构造问题
      const question =
        description || `${propertyKey} 被调用，参数: ${JSON.stringify(args)}`;

      // 执行推理
      const result = await cot.reason(question);

      console.log(`🧠 CoT 推理结果:\n${cot.exportChain()}`);

      // 执行原方法
      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * 🧠 图思维扩展（Graph-CoT）
 * 基于 2024-2025 最新研究
 * @see {@link https://arxiv.org/html/2511.01633v1}
 */
export class GraphChainOfThought extends ChainOfThought {
  private graph: Map<string, string[]> = new Map();
  private nodeResults: Map<string, string> = new Map();

  /**
   * 执行图推理
   */
  async reason(
    question: string,
    context?: string,
    maxNodes: number = 10,
  ): Promise<ReasoningResult> {
    const startTime = Date.now();

    // 基础推理（获取初始思路）
    const baseResult = await super.reason(question, context);

    // 构建知识图谱
    await this.buildKnowledgeGraph(question, context);

    // 图遍历推理
    const graphResult = await this.traverseGraph(question, maxNodes);

    // 自我一致性检查
    const consistencyScore = this.checkSelfConsistency(baseResult.chain);

    return {
      answer: graphResult.finalAnswer,
      chain: [...baseResult.chain, ...graphResult.additionalSteps],
      confidence: baseResult.confidence * consistencyScore,
      state: this.currentState,
      metadata: {
        totalDuration: Date.now() - startTime,
        totalSteps:
          baseResult.chain.length + graphResult.additionalSteps.length,
        verificationPassed: baseResult.metadata?.verificationPassed,
        consistencyScore,
        graphNodes: this.graph.size,
      },
    };
  }

  /**
   * 构建知识图谱
   */
  private async buildKnowledgeGraph(
    question: string,
    context: string | undefined,
  ): Promise<void> {
    // 识别关键概念
    const concepts = this.extractConcepts(question);

    // 建立概念关联
    for (let i = 0; i < concepts.length; i++) {
      const concept = concepts[i];
      this.graph.set(concept, []);

      // 关联相关概念
      for (let j = i + 1; j < concepts.length; j++) {
        if (this.areConceptsRelated(concepts[i], concepts[j])) {
          this.graph.get(concept)!.push(concepts[j]);
        }
      }
    }
  }

  /**
   * 图遍历推理
   */
  private async traverseGraph(
    question: string,
    maxNodes: number,
  ): Promise<{ finalAnswer: string; additionalSteps: ThoughtStep[] }> {
    const additionalSteps: ThoughtStep[] = [];
    const visited = new Set<string>();

    for (const [node, neighbors] of this.graph) {
      if (visited.size >= maxNodes) break;
      if (visited.has(node)) continue;

      visited.add(node);

      additionalSteps.push({
        id: `graph_${Date.now()}_${additionalSteps.length}`,
        thought: `图遍历: ${node} → [${neighbors.join(", ")}]`,
        timestamp: Date.now(),
      } as ThoughtStep);

      // 存储节点结果
      this.nodeResults.set(node, `从 ${node} 推导: ${neighbors.join(" 和 ")}`);
    }

    // 综合图遍历结果
    const finalAnswer = this.synthesizeGraphResults();

    return { finalAnswer, additionalSteps };
  }

  /**
   * 自我一致性检查
   * 多次推理并比较结果
   */
  checkSelfConsistency(chains: ThoughtStep[]): number {
    // 简化实现：检查关键步骤的一致性
    let consistentCount = 0;
    let totalCount = 0;

    for (const step of chains) {
      totalCount++;
      if (step.action && step.thought) {
        // 检查是否有矛盾
        const hasContradiction = this.hasContradiction(step);
        if (!hasContradiction) consistentCount++;
      }
    }

    return totalCount > 0 ? consistentCount / totalCount : 0.5;
  }

  /**
   * 检查是否有矛盾
   */
  private hasContradiction(step: ThoughtStep): boolean {
    // 简化的矛盾检测
    const contradictions = [
      step.thought.includes("不") && step.thought.includes("是"),
      step.thought.includes("假") && step.thought.includes("真"),
    ];

    return contradictions.some((c) => c);
  }

  /**
   * 提取关键概念
   */
  private extractConcepts(text: string): string[] {
    // 简化的概念提取（实际应用中需要 NLP）
    const concepts: string[] = [];
    const words = text.split(/\s+/);

    for (const word of words) {
      if (word.length > 2 && /[a-zA-Z\u4e00-\u9fa5]/.test(word)) {
        concepts.push(word);
      }
    }

    return [...new Set(concepts)].slice(0, 8); // 最多8个概念
  }

  /**
   * 检查概念是否相关
   */
  private areConceptsRelated(concept1: string, concept2: string): boolean {
    // 简化的相关性检测
    const commonPrefixes = ["方法", "函数", "类", "实现", "使用"];
    return commonPrefixes.some(
      (prefix) => concept1.includes(prefix) && concept2.includes(prefix),
    );
  }

  /**
   * 综合图结果
   */
  private synthesizeGraphResults(): string {
    const results = Array.from(this.nodeResults.values());
    if (results.length === 0) {
      return "基于图遍历的综合分析完成";
    }
    return results.join("; ");
  }
}

/**
 * 动态递归 CoT（DR-CoT）
 * 自适应推理深度
 */
export class DynamicRecursiveCoT extends ChainOfThought {
  private maxDepth: number = 5;
  private currentDepth: number = 0;
  private improvementHistory: string[] = [];

  /**
   * 执行自适应深度推理
   */
  async reason(question: string, context?: string): Promise<ReasoningResult> {
    const startTime = Date.now();
    this.currentDepth = 0;

    // 初始推理
    let result = await super.reason(question, context);

    // 根据置信度自适应调整深度
    while (
      result.confidence < this.config.confidenceThreshold &&
      this.currentDepth < this.maxDepth
    ) {
      this.currentDepth++;
      const improvement = await this.deepenReasoning(question, context, result);

      if (improvement.confidence > result.confidence) {
        result = improvement;
        this.improvementHistory.push(
          `深度${this.currentDepth}: 置信度提升 ${result.confidence - improvement.confidence}`,
        );
      } else {
        break; // 无法继续改进
      }
    }

    return {
      ...result,
      metadata: {
        ...result.metadata,
        totalSteps: result.metadata?.totalSteps ?? this.chain.length,
        totalDuration: Date.now() - startTime,
        actualDepth: this.currentDepth,
        improvementHistory: this.improvementHistory,
      },
    };
  }

  /**
   * 深化推理
   */
  private async deepenReasoning(
    question: string,
    context: string | undefined,
    previousResult: ReasoningResult,
  ): Promise<ReasoningResult> {
    // 在更深层面上重新推理
    this.addStep(
      `深度推理(层级${this.currentDepth})`,
      "基于之前结果进行深化分析",
    );

    // 生成改进的答案
    const improvedAnswer = `${previousResult.answer}\n\n(深度${this.currentDepth}补充: ${this.generateDeeperInsight(previousResult)})`;

    return {
      ...previousResult,
      answer: improvedAnswer,
      confidence: Math.min(previousResult.confidence + 0.1, 0.99),
    };
  }

  /**
   * 生成更深入的洞察
   */
  private generateDeeperInsight(result: ReasoningResult): string {
    const insights = [
      "考虑边界情况",
      "验证假设前提",
      "探索替代方案",
      "量化不确定性",
    ];

    return insights[Math.floor(Math.random() * insights.length)];
  }
}

/**
 * 创建图思维推理器
 */
export function createGraphChainOfThought(
  config?: ChainConfig,
): GraphChainOfThought {
  return new GraphChainOfThought(config);
}

/**
 * 创建动态递归推理器
 */
export function createDynamicRecursiveCoT(
  config?: ChainConfig,
): DynamicRecursiveCoT {
  return new DynamicRecursiveCoT(config);
}
