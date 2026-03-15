/**
 * 🦞 龙虾 ReAct 智能体
 *
 * 实现 ReAct (Reasoning + Acting) 模式
 * 基于 2026 AI Agent 最佳实践
 *
 * @see {@link https://mbrenndoerfer.com/writing/react-pattern-llm-reasoning-action-agents}
 * @see {@link https://arxiv.org/abs/2210.03629}
 */

/**
 * ReAct 思考步骤
 */
export interface ThoughtStep {
  /** 步骤ID */
  id: string;
  /** 思考内容 */
  thought: string;
  /** 行动描述 */
  action?: string;
  /** 行动输入 */
  actionInput?: Record<string, any>;
  /** 观察结果 */
  observation?: string;
  /** 时间戳 */
  timestamp: number;
  /** 推理深度 */
  depth: number;
}

/**
 * ReAct 工具定义
 */
export interface ReActTool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数schema */
  parameters?: Record<
    string,
    { type: string; description: string; required?: boolean }
  >;
  /** 执行函数 */
  execute: (params: Record<string, any>) => Promise<string> | string;
}

/**
 * ReAct 配置
 */
export interface ReActConfig {
  /** 最大推理深度 */
  maxDepth?: number;
  /** 最大迭代次数 */
  maxIterations?: number;
  /** 是否启用记忆 */
  enableMemory?: boolean;
  /** 思考超时（毫秒） */
  thinkTimeout?: number;
  /** 启用自我反思 */
  enableSelfReflection?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<ReActConfig> = {
  maxDepth: 10,
  maxIterations: 20,
  enableMemory: true,
  thinkTimeout: 30000,
  enableSelfReflection: true,
};

/**
 * 记忆条目
 */
interface MemoryEntry {
  thought: string;
  action: string;
  result: string;
  timestamp: number;
}

/**
 * ReAct 智能体状态
 */
export type ReActState =
  | "thinking" // 推理中
  | "acting" // 执行行动
  | "observing" // 观察结果
  | "reflecting" // 自我反思
  | "done" // 完成
  | "error"; // 错误

/**
 * ReAct 智能体
 *
 * 实现 Reasoning + Acting 交错执行模式
 */
export class ReActAgent {
  private tools: Map<string, ReActTool> = new Map();
  private memory: MemoryEntry[] = [];
  private thoughts: ThoughtStep[] = [];
  private config: Required<ReActConfig>;
  private currentState: ReActState = "thinking";

  constructor(config: ReActConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 注册工具
   */
  registerTool(tool: ReActTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 批量注册工具
   */
  registerTools(tools: ReActTool[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * 注销工具
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 执行任务
   */
  async execute(
    objective: string,
    context?: string,
  ): Promise<{ answer: string; steps: ThoughtStep[] }> {
    this.thoughts = [];
    this.currentState = "thinking";

    let iteration = 0;
    let finalAnswer = "";

    while (
      iteration < this.config.maxIterations &&
      this.currentState !== "done"
    ) {
      const step = await this.think(objective, context, iteration);
      this.thoughts.push(step);

      // 执行行动
      if (step.action && step.actionInput) {
        this.currentState = "acting";
        const result = await this.act(step.action, step.actionInput);

        this.currentState = "observing";
        const observation = await this.observe(result);
        step.observation = observation;

        // 检查是否获得最终答案
        if (this.isFinalAnswer(observation)) {
          finalAnswer = this.extractAnswer(observation);
          this.currentState = "done";
        }
      }

      // 自我反思
      if (
        this.config.enableSelfReflection &&
        iteration > 0 &&
        iteration % 3 === 0
      ) {
        this.currentState = "reflecting";
        await this.reflect();
      }

      iteration++;
    }

    // 保存到记忆
    if (this.config.enableMemory) {
      for (const step of this.thoughts) {
        if (step.action && step.observation) {
          this.memory.push({
            thought: step.thought,
            action: step.action,
            result: step.observation,
            timestamp: step.timestamp,
          });
        }
      }
    }

    return { answer: finalAnswer || "未能完成目标", steps: this.thoughts };
  }

  /**
   * 推理阶段
   */
  private async think(
    objective: string,
    context: string | undefined,
    iteration: number,
  ): Promise<ThoughtStep> {
    const depth = Math.min(iteration, this.config.maxDepth);
    const timestamp = Date.now();

    // 构建思考提示
    const prompt = this.buildThinkPrompt(objective, context, iteration);

    // 模拟推理过程（实际应用中调用 LLM）
    const thought = await this.generateThought(prompt, iteration);

    // 解析行动
    const { action, actionInput } = this.parseAction(thought);

    return {
      id: `thought_${timestamp}_${iteration}`,
      thought,
      action,
      actionInput,
      timestamp,
      depth,
    };
  }

  /**
   * 行动阶段
   */
  private async act(action: string, input: Record<string, any>): Promise<any> {
    const tool = this.tools.get(action);

    if (!tool) {
      throw new Error(`工具不存在: ${action}`);
    }

    try {
      return await tool.execute(input);
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  /**
   * 观察阶段
   */
  private async observe(result: any): Promise<string> {
    if (typeof result === "string") {
      return result;
    }

    if (result.error) {
      return `错误: ${result.error}`;
    }

    return JSON.stringify(result);
  }

  /**
   * 自我反思
   */
  private async reflect(): Promise<void> {
    // 分析最近的思考步骤
    const recentSteps = this.thoughts.slice(-5);

    // 检测循环模式
    if (this.detectLoop(recentSteps)) {
      // 尝试不同的策略
      console.log("🦞 检测到循环，切换策略");
    }

    // 检测失败模式
    if (this.detectFailure(recentSteps)) {
      // 记录失败原因
      console.log("🦞 检测到失败模式");
    }
  }

  /**
   * 构建思考提示
   */
  private buildThinkPrompt(
    objective: string,
    context: string | undefined,
    iteration: number,
  ): string {
    const availableTools = Array.from(this.tools.values())
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n");

    return `
Question: ${objective}

Context: ${context || "无"}

Available Tools:
${availableTools}

Recent Memory:
${this.memory
  .slice(-5)
  .map(
    (m) =>
      `- Thought: ${m.thought}\n  Action: ${m.action}\n  Result: ${m.result}`,
  )
  .join("\n\n")}

Iteration: ${iteration}

Respond with:
Thought: [your reasoning]
Action: [tool name] or "Finish" if done
Action Input: [JSON input for the tool]
`.trim();
  }

  /**
   * 生成思考（模拟 LLM）
   */
  private async generateThought(
    prompt: string,
    iteration: number,
  ): Promise<string> {
    // 实际应用中这里会调用 LLM API
    // 现在返回一个模拟的思考过程

    const thoughts = [
      "我需要分析当前情况，找出相关信息",
      "让我先搜索相关的背景知识",
      "根据已有信息，我可以推断出答案",
      "我需要验证这个假设是否正确",
      "综合所有信息，我得出结论",
    ];

    return thoughts[iteration % thoughts.length];
  }

  /**
   * 解析行动
   */
  private parseAction(thought: string): {
    action?: string;
    actionInput?: Record<string, any>;
  } {
    // 简单解析，实际应用中需要更复杂的解析
    if (thought.toLowerCase().includes("finish")) {
      return {};
    }

    for (const toolName of this.tools.keys()) {
      if (thought.toLowerCase().includes(toolName.toLowerCase())) {
        return { action: toolName, actionInput: {} };
      }
    }

    return {};
  }

  /**
   * 检测是否最终答案
   */
  private isFinalAnswer(observation: string): boolean {
    return observation.length > 10 && !observation.startsWith("错误");
  }

  /**
   * 提取答案
   */
  private extractAnswer(observation: string): string {
    return observation;
  }

  /**
   * 检测循环模式
   */
  private detectLoop(steps: ThoughtStep[]): boolean {
    if (steps.length < 3) return false;

    const thoughts = steps.map((s) => s.thought);
    const lastThought = thoughts[thoughts.length - 1];

    return thoughts.filter((t) => t === lastThought).length >= 2;
  }

  /**
   * 检测失败模式
   */
  private detectFailure(steps: ThoughtStep[]): boolean {
    return steps.filter((s) => s.observation?.startsWith("错误")).length >= 2;
  }

  /**
   * 获取思考历史
   */
  getThoughtHistory(): ThoughtStep[] {
    return [...this.thoughts];
  }

  /**
   * 获取记忆
   */
  getMemory(): MemoryEntry[] {
    return [...this.memory];
  }

  /**
   * 清除记忆
   */
  clearMemory(): void {
    this.memory = [];
  }

  /**
   * 获取状态
   */
  getState(): ReActState {
    return this.currentState;
  }

  /**
   * 导出思考链
   */
  exportThoughtChain(): string {
    return this.thoughts
      .map(
        (step, i) =>
          `Step ${i + 1} (Depth ${step.depth}):\n` +
          `  Thought: ${step.thought}\n` +
          (step.action
            ? `  Action: ${step.action}(${JSON.stringify(step.actionInput)})\n`
            : "") +
          (step.observation ? `  Observation: ${step.observation}\n` : ""),
      )
      .join("\n");
  }
}

/**
 * 创建 ReAct 智能体
 */
export function createReActAgent(config?: ReActConfig): ReActAgent {
  return new ReActAgent(config);
}

/**
 * 常用工具工厂
 */
export const ReActTools = {
  /**
   * 搜索工具
   */
  search: (fn: (query: string) => Promise<string>): ReActTool => ({
    name: "search",
    description: "搜索信息",
    parameters: {
      query: { type: "string", description: "搜索查询", required: true },
    },
    execute: async ({ query }) => fn(query),
  }),

  /**
   * 计算工具
   */
  calculate: (fn: (expression: string) => number): ReActTool => ({
    name: "calculate",
    description: "执行数学计算",
    parameters: {
      expression: { type: "string", description: "数学表达式", required: true },
    },
    execute: ({ expression }) => fn(expression).toString(),
  }),

  /**
   * 查询工具
   */
  query: (fn: (key: string) => Promise<any>): ReActTool => ({
    name: "query",
    description: "查询数据库或知识库",
    parameters: {
      key: { type: "string", description: "查询键", required: true },
    },
    execute: async ({ key }) => JSON.stringify(await fn(key)),
  }),

  /**
   * 验证工具
   */
  validate: (fn: (data: any) => boolean): ReActTool => ({
    name: "validate",
    description: "验证数据或假设",
    parameters: {
      data: { type: "any", description: "待验证数据", required: true },
    },
    execute: async ({ data }) => (fn(data) ? "验证通过" : "验证失败"),
  }),
};
