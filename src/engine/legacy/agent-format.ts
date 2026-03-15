/**
 * 🦞 AgenticFormat 标准
 *
 * 基于 Auton Agentic AI Framework (arXiv:2602.23720v1)
 * 语言无关的声明式 Agent 定义规范
 *
 * 核心理念: Agent-as-Configuration 而非 Agent-as-Code
 *
 * @see {@link https://arxiv.org/html/2602.23720v1} - "The Auton Agentic AI Framework"
 * @see {@link https://www.anthropic.com/engineering/code-execution-with-mcp} - MCP Integration
 */

/**
 * 约束类型
 */
export enum ConstraintType {
  /** 只读约束 */
  READ_ONLY = "read_only",
  /** 行级安全 */
  ROW_LEVEL_SECURITY = "row_level_security",
  /** 数据驻留 */
  DATA_RESIDENCY = "data_residency",
  /** PII 保护 */
  PII_EGRESS = "pii_egress",
  /** 资源预算 */
  RESOURCE_BUDGET = "resource_budget",
  /** Token 预算 */
  TOKEN_BUDGET = "token_budget",
}

/**
 * 约束谓词
 */
export interface ConstraintPredicate {
  /** 约束类型 */
  type: ConstraintType;
  /** 约束表达式 (代码级规范) */
  expression?: string;
  /** 允许的值列表 */
  allowedValues?: any[];
  /** 拒绝的值列表 */
  deniedValues?: any[];
  /** 正则表达式验证 */
  pattern?: string;
  /** 自定义验证器函数 */
  validator?: string; // 引用函数名
}

/**
 * 约束流形
 */
export interface ConstraintManifold {
  /** 约束谓词列表 */
  predicates: ConstraintPredicate[];
  /** 约束逻辑 (AND/OR) */
  logic?: "AND" | "OR";
}

/**
 * 输入/输出契约
 */
export interface ContractSchema {
  /** 内容类型 (JSON Schema, YAML inline, Pydantic model) */
  contentType: "json_schema" | "yaml_inline" | "pydantic" | "typescript";
  /** Schema 定义 */
  schema?: Record<string, any>;
  /** JSON Schema 定义 (当 contentType=json_schema) */
  jsonSchema?: object;
  /** 类型定义文件路径 */
  typeDefinition?: string;
}

/**
 * MCP 服务器绑定
 */
export interface MCPServerBinding {
  /** 服务器别名 */
  alias: string;
  /** 服务器 URL */
  url: string;
  /** 允许的工具列表 */
  allowTools: string[];
  /** 认证配置 */
  auth?: {
    type?: "token" | "oauth" | "api_key";
    credentialsRef?: string; // 引用环境变量或密钥存储
  };
}

/**
 * 本地子 Agent 引用
 */
export interface LocalAgentRef {
  /** 子 Agent 别名 */
  alias: string;
  /** Agent 定义源文件路径 */
  source: string;
}

/**
 * 动作空间配置
 */
export interface ActionSpace {
  /** MCP 服务器绑定 */
  mcpServers?: MCPServerBinding[];
  /** 本地子 Agent */
  localAgents?: LocalAgentRef[];
  /** 可用的工具列表 (直接绑定) */
  directTools?: string[];
}

/**
 * 执行策略
 */
export interface ExecutionPolicy {
  /** 策略 ID */
  id: string;
  /** 配置 */
  config: {
    /** 模型提供商 */
    provider?: "google" | "anthropic" | "openai" | "custom";
    /** 模型名称 */
    model?: string;
    /** 指令/提示词 */
    instructions?: string;
    /** 最大步数 */
    maxSteps?: number;
    /** 温度参数 */
    temperature?: number;
    /** 工具选择策略 */
    toolChoice?: "auto" | "required" | "none";
    /** 推理模式 */
    reasoningMode?: "chain_of_thought" | "tree_of_thought" | "react";
  };
}

/**
 * 预算配置
 */
export interface BudgetConfig {
  /** 最大 Token 使用量 */
  maxTokenUsage?: number;
  /** 最大执行时间 (毫秒) */
  maxExecutionTime?: number;
  /** 最大 API 调用次数 */
  maxApiCalls?: number;
  /** 成本约束 (KKT 条件中的拉格朗日乘数) */
  costConstraint?: {
    currency: string;
    maxCost: number;
  };
}

/**
 * 元数据
 */
export interface AgentMetadata {
  /** Agent 唯一标识 */
  id: string;
  /** Agent 显示名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 作者/维护者 */
  authors?: string[];
  /** 标签 */
  tags?: string[];
  /** 描述 */
  description?: string;
  /** 创建时间 */
  createdAt?: string;
  /** 更新时间 */
  updatedAt?: string;
}

/**
 * 接口定义
 */
export interface AgentInterface {
  /** 输入契约 */
  input: ContractSchema;
  /** 输出契约 */
  output: ContractSchema;
}

/**
 * Agent 卡片 (AgenticFormat 核心定义)
 *
 * 这是一个语言无关的声明式配置，定义 Agent 的:
 * - 身份和元数据
 * - 接口契约
 * - 约束流形
 * - 动作空间
 * - 执行策略
 * - 预算限制
 */
export interface AgentCard {
  /** 元数据 */
  metadata: AgentMetadata;

  /** 接口定义 */
  interface: AgentInterface;

  /** 约束流形 */
  constraints?: {
    /** 约束谓词列表 */
    predicates?: ConstraintPredicate[];
    /** 约束流形定义 */
    manifold?: ConstraintManifold;
    /** 只读不变式 */
    invariants?: string[];
  };

  /** 动作空间 */
  actionSpace: ActionSpace;

  /** 执行策略 */
  executionPolicy: ExecutionPolicy;

  /** 预算配置 */
  budget?: BudgetConfig;

  /** 扩展配置 */
  extensions?: Record<string, any>;
}

/**
 * AgenticFormat 解析器
 *
 * 负责加载和验证 Agent 卡片
 */
export class AgentFormatParser {
  /**
   * 从 YAML/JSON 解析 Agent 卡片
   */
  static parse(source: string): AgentCard {
    try {
      const data = JSON.parse(source);
      return this.validate(data);
    } catch (error) {
      throw new Error(`Invalid AgentCard format: ${error}`);
    }
  }

  /**
   * 验证 Agent 卡片
   */
  static validate(card: any): AgentCard {
    // 验证必需字段
    if (!card.metadata?.id || !card.metadata?.name) {
      throw new Error("Agent metadata must include 'id' and 'name'");
    }

    if (
      !card.interface?.input?.contentType ||
      !card.interface?.output?.contentType
    ) {
      throw new Error(
        "Agent interface must include input and output contracts",
      );
    }

    if (!card.executionPolicy?.id) {
      throw new Error("Agent must specify an execution policy");
    }

    return card as AgentCard;
  }

  /**
   * 序列化为 YAML
   */
  static serializeYaml(card: AgentCard): string {
    const lines: string[] = [];
    lines.push("# AgenticFormat Agent Card");
    lines.push(`# ID: ${card.metadata.id}`);
    lines.push(`# Version: ${card.metadata.version}`);
    lines.push("");

    lines.push("metadata:");
    this.writeYaml(lines, card.metadata, "  ");
    lines.push("");

    lines.push("interface:");
    lines.push("  input:");
    this.writeYaml(lines, card.interface.input, "    ");
    lines.push("  output:");
    this.writeYaml(lines, card.interface.output, "    ");
    lines.push("");

    if (card.constraints?.predicates) {
      lines.push("constraints:");
      lines.push("  predicates:");
      card.constraints.predicates.forEach((p, i) => {
        lines.push(`    - type: ${p.type}`);
        if (p.expression) lines.push(`      expression: ${p.expression}`);
        if (p.allowedValues)
          lines.push(`      allowedValues: ${JSON.stringify(p.allowedValues)}`);
        if (p.deniedValues)
          lines.push(`      deniedValues: ${JSON.stringify(p.deniedValues)}`);
      });
      lines.push("");
    }

    lines.push("actionSpace:");
    if (card.actionSpace.mcpServers?.length) {
      lines.push("  mcpServers:");
      card.actionSpace.mcpServers.forEach((s) => {
        lines.push(`    - alias: ${s.alias}`);
        lines.push(`      url: ${s.url}`);
        lines.push(`      allowTools: [${s.allowTools.join(", ")}]`);
      });
    }
    if (card.actionSpace.localAgents?.length) {
      lines.push("  localAgents:");
      card.actionSpace.localAgents.forEach((a) => {
        lines.push(`    - alias: ${a.alias}`);
        lines.push(`      source: ${a.source}`);
      });
    }
    lines.push("");

    lines.push("executionPolicy:");
    lines.push("  id: " + card.executionPolicy.id);
    lines.push("  config:");
    this.writeYaml(lines, card.executionPolicy.config, "    ");

    return lines.join("\n");
  }

  /**
   * 序列化为 JSON
   */
  static serializeJson(card: AgentCard): string {
    return JSON.stringify(card, null, 2);
  }

  /**
   * 辅助方法: 写入 YAML
   */
  private static writeYaml(lines: string[], obj: any, indent: string): void {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        lines.push(`${indent}${key}:`);
        value.forEach((item, i) => {
          const itemStr =
            typeof item === "object"
              ? JSON.stringify(item, null, 0)
              : String(item);
          lines.push(`${indent}  - ${itemStr}`);
        });
      } else if (typeof value === "object" && value !== null) {
        lines.push(`${indent}${key}:`);
        this.writeYaml(lines, value, indent + "  ");
      } else {
        lines.push(`${indent}${key}: ${JSON.stringify(value)}`);
      }
    }
  }
}

/**
 * 约束流形投影器
 *
 * 实现策略投影到安全流形
 */
export class ConstraintManifoldProjector {
  /**
   * 计算约束流形掩码
   */
  static computeMask(
    rawAction: string,
    constraints: ConstraintPredicate[],
  ): { allowed: boolean; reason?: string } {
    for (const constraint of constraints) {
      const result = this.evaluateConstraint(rawAction, constraint);
      if (!result.allowed) {
        return result;
      }
    }
    return { allowed: true };
  }

  /**
   * 评估单个约束
   */
  private static evaluateConstraint(
    action: string,
    constraint: ConstraintPredicate,
  ): { allowed: boolean; reason?: string } {
    switch (constraint.type) {
      case ConstraintType.READ_ONLY:
        // 检查是否包含写操作关键词
        const writeKeywords = [
          "INSERT",
          "UPDATE",
          "DELETE",
          "DROP",
          "ALTER",
          "CREATE",
        ];
        const hasWriteKeyword = writeKeywords.some((kw) =>
          action.toUpperCase().includes(kw),
        );
        if (hasWriteKeyword) {
          return {
            allowed: false,
            reason: "Contains write operation (read-only constraint)",
          };
        }
        break;

      case ConstraintType.TOKEN_BUDGET:
        // 估算 Token 成本
        const estimatedTokens = action.length / 4; // 粗略估算
        if (
          constraint.expression &&
          estimatedTokens > parseInt(constraint.expression)
        ) {
          return {
            allowed: false,
            reason: `Exceeds token budget (${estimatedTokens} > ${constraint.expression})`,
          };
        }
        break;

      case ConstraintType.PII_EGRESS:
        // 检查 PII 模式
        const piiPatterns = [
          /\d{3}-\d{2}-\d{4}/, // SSN
          /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
          /\b\d{16}\b/, // Credit Card
        ];
        for (const pattern of piiPatterns) {
          if (pattern.test(action)) {
            return { allowed: false, reason: "Contains PII data" };
          }
        }
        break;
    }

    if (
      constraint.allowedValues &&
      !constraint.allowedValues.includes(action)
    ) {
      return { allowed: false, reason: `Not in allowed values list` };
    }

    if (constraint.deniedValues && constraint.deniedValues.includes(action)) {
      return { allowed: false, reason: `In denied values list` };
    }

    if (constraint.pattern && !new RegExp(constraint.pattern).test(action)) {
      return { allowed: false, reason: `Does not match required pattern` };
    }

    return { allowed: true };
  }

  /**
   * 投影策略到安全流形
   *
   * 将原始策略投影到约束流形，确保所有生成动作都在安全子空间内
   */
  static projectPolicy(
    rawPolicy: Map<string, number>,
    constraints: ConstraintPredicate[],
  ): Map<string, number> {
    const safePolicy = new Map<string, number>();
    let totalMass = 0;

    for (const [action, probability] of rawPolicy.entries()) {
      const { allowed } = this.computeMask(action, constraints);
      if (allowed) {
        safePolicy.set(action, probability);
        totalMass += probability;
      }
    }

    // 归一化
    if (totalMass > 0) {
      for (const [action, probability] of safePolicy.entries()) {
        safePolicy.set(action, probability / totalMass);
      }
    }

    return safePolicy;
  }
}

/**
 * 工厂函数: 创建 Agent 卡片
 */
export function createAgentCard(
  metadata: AgentMetadata,
  options?: Partial<AgentCard>,
): AgentCard {
  const now = new Date().toISOString();

  const defaultCard: AgentCard = {
    metadata: {
      ...metadata,
      createdAt: now,
      updatedAt: now,
    },
    interface: {
      input: {
        contentType: "json_schema",
        jsonSchema: {
          type: "object",
          properties: {
            task: { type: "string" },
            parameters: { type: "object" },
          },
        },
      },
      output: {
        contentType: "json_schema",
        jsonSchema: {
          type: "object",
          properties: {
            result: { type: "any" },
            status: { type: "string" },
            reasoning: { type: "string" },
          },
        },
      },
    },
    constraints: {
      predicates: [],
      manifold: {
        predicates: [],
        logic: "AND",
      },
      invariants: [],
    },
    actionSpace: {
      mcpServers: [],
      localAgents: [],
      directTools: [],
    },
    executionPolicy: {
      id: "default",
      config: {
        provider: "anthropic",
        model: "claude-sonnet-4",
        instructions: "You are a helpful AI agent.",
        maxSteps: 10,
        temperature: 0.7,
        toolChoice: "auto",
      },
    },
    budget: {
      maxTokenUsage: 50000,
      maxExecutionTime: 300000, // 5 minutes
    },
  };

  return { ...defaultCard, ...options };
}

/**
 * 工厂函数: 创建代码审查 Agent
 */
export function createCodeReviewerAgent(): AgentCard {
  return createAgentCard(
    {
      id: "code_reviewer_v1",
      name: "Code Reviewer",
      version: "1.0.0",
      authors: ["AI Engineering"],
      tags: ["code-quality", "automated"],
      description: "Automated code review agent with schema-conformant output",
    },
    {
      interface: {
        input: {
          contentType: "json_schema",
          jsonSchema: {
            type: "object",
            properties: {
              pr_url: { type: "string" },
              file_path: { type: "string" },
              review_focus: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["correctness", "style", "security"],
                },
              },
            },
            required: ["pr_url"],
          },
        },
        output: {
          contentType: "json_schema",
          jsonSchema: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["approved", "changes_requested", "rejected"],
              },
              review: { type: "string" },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    severity: {
                      type: "string",
                      enum: ["error", "warning", "info"],
                    },
                    file: { type: "string" },
                    line: { type: "number" },
                    message: { type: "string" },
                    suggestion: { type: "string" },
                  },
                },
              },
              metrics: {
                type: "object",
                properties: {
                  complexity_score: { type: "number" },
                  test_coverage: { type: "number" },
                },
              },
            },
          },
        },
      },
      constraints: {
        predicates: [
          {
            type: ConstraintType.READ_ONLY,
          },
          {
            type: ConstraintType.TOKEN_BUDGET,
            expression: "50000",
          },
        ],
        invariants: ["tighten_only_invariant"],
      },
      executionPolicy: {
        id: "code_reviewer_policy",
        config: {
          provider: "anthropic",
          model: "claude-sonnet-4",
          instructions:
            "Review the code for correctness, style, and security issues.",
          maxSteps: 15,
          temperature: 0.3,
          toolChoice: "required",
        },
      },
    },
  );
}

/**
 * 导出工具函数
 */
export const AgentFormatUtils = {
  parse: AgentFormatParser.parse.bind(AgentFormatParser),
  serializeYaml: AgentFormatParser.serializeYaml.bind(AgentFormatParser),
  serializeJson: AgentFormatParser.serializeJson.bind(AgentFormatParser),
  validate: AgentFormatParser.validate.bind(AgentFormatParser),
  createAgentCard,
  createCodeReviewerAgent,
};
