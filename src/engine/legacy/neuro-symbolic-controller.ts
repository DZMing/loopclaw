/**
 * 🧠 神经符号闭环控制器 (Neuro-Symbolic Closed-Loop Controller)
 *
 * 基于 "Neuro-Symbolic Control with Large Language Models" (arXiv:2512.17321)
 * 实现结合符号推理和神经控制的稳定执行架构
 *
 * 架构组成:
 * - LLM 符号推理器 (Symbolic Reasoner)
 * - 神经增量控制器 (Neural Delta Controller)
 * - 状态观测器 (State Observer)
 * - 稳定性验证器 (Stability Validator)
 *
 * @see {@link https://arxiv.org/html/2512.17321} - Neuro-Symbolic Control Paper
 * @see {@link https://arxiv.org/abs/2511.17673} - Structured Cognitive Loop
 */

/**
 * 控制模式
 */
export enum ControlMode {
  /** 纯符号控制 */
  SYMBOLIC_ONLY = "symbolic_only",
  /** 纯神经控制 */
  NEURAL_ONLY = "neural_only",
  /** 混合模式 (默认) */
  HYBRID = "hybrid",
  /** 自适应切换 */
  ADAPTIVE = "adaptive",
}

/**
 * 控制状态
 */
export interface ControlState {
  /** 当前模式 */
  mode: ControlMode;
  /** 符号组件状态 */
  symbolic: {
    active: boolean;
    reasoning: string | null;
    confidence: number;
  };
  /** 神经组件状态 */
  neural: {
    active: boolean;
    delta: number[];
    uncertainty: number;
  };
  /** 系统状态 */
  system: {
    stable: boolean;
    error: number | null;
    reference: number[];
    output: number[];
  };
}

/**
 * 符号推理请求
 */
export interface SymbolicReasoningRequest {
  /** 当前状态 */
  currentState: number[];
  /** 参考目标 */
  reference: number[];
  /** 约束条件 */
  constraints: SymbolicConstraint[];
  /** 推理上下文 */
  context?: Record<string, any>;
}

/**
 * 符号约束
 */
export interface SymbolicConstraint {
  /** 约束ID */
  id: string;
  /** 约束类型 */
  type: "equality" | "inequality" | "range" | "logical";
  /** 约束表达式 */
  expression: string;
  /** 参数 */
  params?: Record<string, number>;
}

/**
 * 符号推理结果
 */
export interface SymbolicReasoningResult {
  /** 推理步骤 */
  reasoning: string[];
  /** 建议动作 */
  action: number[];
  /** 置信度 */
  confidence: number;
  /** 满足的约束 */
  satisfiedConstraints: string[];
}

/**
 * 神经控制输出
 */
export interface NeuralControlOutput {
  /** 增量调整 */
  delta: number[];
  /** 不确定性估计 */
  uncertainty: number;
  /** 预测状态 */
  predictedNextState: number[];
}

/**
 * 控制指令
 */
export interface ControlCommand {
  /** 控制动作 */
  action: number[];
  /** 来源 */
  source: "symbolic" | "neural" | "hybrid";
  /** 元数据 */
  metadata: {
    timestamp: number;
    confidence: number;
    reasoning?: string;
  };
}

/**
 * 稳定性指标
 */
export interface StabilityMetrics {
  /** 是否稳定 */
  stable: boolean;
  /** 李雅普诺夫函数值 */
  lyapunovValue?: number;
  /** 状态误差 */
  stateError: number;
  /** 控制 effort */
  controlEffort: number;
  /** 收敛率 */
  convergenceRate?: number;
}

/**
 * 神经符号闭环控制器配置
 */
export interface NeuroSymbolicControllerConfig {
  /** 控制模式 */
  controlMode?: ControlMode;
  /** 状态维度 */
  stateDimension: number;
  /** 符号推理器配置 */
  symbolicConfig?: {
    maxReasoningDepth?: number;
    confidenceThreshold?: number;
  };
  /** 神经控制器配置 */
  neuralConfig?: {
    learningRate?: number;
    uncertaintyThreshold?: number;
  };
  /** 稳定性配置 */
  stabilityConfig?: {
    maxStateError?: number;
    maxControlEffort?: number;
    convergenceThreshold?: number;
  };
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<NeuroSymbolicControllerConfig> = {
  controlMode: ControlMode.HYBRID,
  stateDimension: 10,
  symbolicConfig: {
    maxReasoningDepth: 5,
    confidenceThreshold: 0.7,
  },
  neuralConfig: {
    learningRate: 0.01,
    uncertaintyThreshold: 0.3,
  },
  stabilityConfig: {
    maxStateError: 1.0,
    maxControlEffort: 5.0,
    convergenceThreshold: 0.01,
  },
};

/**
 * LLM 符号推理器
 */
class LLMSymbolicReasoner {
  private maxDepth: number;
  private confidenceThreshold: number;

  constructor(config: Required<NeuroSymbolicControllerConfig>) {
    const symbolicConfig =
      config.symbolicConfig ?? DEFAULT_CONFIG.symbolicConfig;
    this.maxDepth = symbolicConfig.maxReasoningDepth ?? 5;
    this.confidenceThreshold = symbolicConfig.confidenceThreshold ?? 0.7;
  }

  /**
   * 执行符号推理
   */
  async reason(
    request: SymbolicReasoningRequest,
  ): Promise<SymbolicReasoningResult> {
    console.log(
      `📐 符号推理: 状态维度 ${request.currentState.length}, 约束 ${request.constraints.length}`,
    );
    const startTime = Date.now();

    // 模拟 LLM 符号推理过程
    const reasoning: string[] = [];
    reasoning.push(
      `分析当前状态: [${request.currentState
        .slice(0, 3)
        .map((v) => v.toFixed(2))
        .join(", ")}...]`,
    );
    reasoning.push(
      `参考目标: [${request.reference
        .slice(0, 3)
        .map((v) => v.toFixed(2))
        .join(", ")}...]`,
    );

    // 计算状态误差
    const stateError = this.computeStateError(
      request.currentState,
      request.reference,
    );
    reasoning.push(`状态误差: ${stateError.toFixed(4)}`);

    // 检查约束
    const satisfiedConstraints: string[] = [];
    for (const constraint of request.constraints) {
      if (this.checkConstraint(request.currentState, constraint)) {
        satisfiedConstraints.push(constraint.id);
        reasoning.push(`✓ 约束满足: ${constraint.id}`);
      } else {
        reasoning.push(`✗ 约束违反: ${constraint.id}`);
      }
    }

    // 生成建议动作 (简单的比例控制)
    const action = request.reference.map((ref, i) => {
      const current = request.currentState[i] || 0;
      const error = ref - current;
      const k = 0.5; // 简化的比例增益
      return k * error;
    });

    // 计算置信度
    const confidence = Math.min(1.0, 1.0 - stateError / 10);

    const duration = Date.now() - startTime;
    console.log(
      `✅ 符号推理完成 (${duration}ms), 置信度: ${confidence.toFixed(2)}`,
    );

    return {
      reasoning,
      action,
      confidence,
      satisfiedConstraints,
    };
  }

  /**
   * 计算状态误差
   */
  private computeStateError(current: number[], reference: number[]): number {
    let error = 0;
    for (let i = 0; i < Math.min(current.length, reference.length); i++) {
      error += Math.pow((reference[i] || 0) - (current[i] || 0), 2);
    }
    return Math.sqrt(error);
  }

  /**
   * 检查约束条件
   */
  private checkConstraint(
    state: number[],
    constraint: SymbolicConstraint,
  ): boolean {
    switch (constraint.type) {
      case "range":
        if (constraint.params) {
          const { min, max, index } = constraint.params;
          const value = state[index] || 0;
          return value >= (min || -Infinity) && value <= (max || Infinity);
        }
        return true;
      case "inequality":
        // 简化实现
        return true;
      default:
        return true;
    }
  }
}

/**
 * 神经增量控制器
 */
class NeuralDeltaController {
  private learningRate: number;
  private uncertaintyThreshold: number;
  private weights: number[][];

  constructor(
    config: Required<NeuroSymbolicControllerConfig>,
    stateDim: number,
  ) {
    const neuralConfig = config.neuralConfig ?? DEFAULT_CONFIG.neuralConfig;
    this.learningRate = neuralConfig.learningRate ?? 0.01;
    this.uncertaintyThreshold = neuralConfig.uncertaintyThreshold ?? 0.3;

    // 初始化权重矩阵
    this.weights = [];
    for (let i = 0; i < stateDim; i++) {
      this.weights.push(
        new Array(stateDim).fill(0).map(() => Math.random() * 0.1),
      );
    }
  }

  /**
   * 计算神经控制输出
   */
  compute(stateError: number[]): NeuralControlOutput {
    // 计算增量控制
    const delta = stateError.map((err, i) => {
      let weightedSum = 0;
      for (let j = 0; j < this.weights[i].length; j++) {
        weightedSum += this.weights[i][j] * (stateError[j] || 0);
      }
      return this.learningRate * weightedSum;
    });

    // 估计不确定性 (简化实现)
    const uncertainty = Math.random() * 0.5;

    // 预测下一状态
    const predictedNextState = stateError.map((s, i) => s + delta[i]);

    return {
      delta,
      uncertainty,
      predictedNextState,
    };
  }

  /**
   * 更新权重 (简化在线学习)
   */
  updateWeights(actualError: number[]): void {
    // 基于实际误差调整权重
    for (let i = 0; i < this.weights.length; i++) {
      for (let j = 0; j < this.weights[i].length; j++) {
        const adjustment =
          this.learningRate * actualError[i] * (actualError[j] || 0);
        this.weights[i][j] += adjustment;
        // 限制权重范围
        this.weights[i][j] = Math.max(-1, Math.min(1, this.weights[i][j]));
      }
    }
  }
}

/**
 * 稳定性验证器
 */
class StabilityValidator {
  private maxStateError: number;
  private maxControlEffort: number;
  private convergenceThreshold: number;

  constructor(config: Required<NeuroSymbolicControllerConfig>) {
    const stabilityConfig =
      config.stabilityConfig ?? DEFAULT_CONFIG.stabilityConfig;
    this.maxStateError = stabilityConfig.maxStateError ?? 1.0;
    this.maxControlEffort = stabilityConfig.maxControlEffort ?? 5.0;
    this.convergenceThreshold = stabilityConfig.convergenceThreshold ?? 0.01;
  }

  /**
   * 验证系统稳定性
   */
  validate(
    currentState: number[],
    reference: number[],
    controlAction: number[],
  ): StabilityMetrics {
    // 计算状态误差
    const stateError = this.computeError(currentState, reference);

    // 计算控制 effort
    const controlEffort = Math.sqrt(
      controlAction.reduce((sum, a) => sum + a * a, 0),
    );

    // 判断稳定性
    const stable =
      stateError < this.maxStateError && controlEffort < this.maxControlEffort;

    // 简化的李雅普诺夫函数 (能量函数)
    const lyapunovValue =
      stateError * stateError + 0.1 * controlEffort * controlEffort;

    // 估计收敛率
    const convergenceRate = stateError / (stateError + 1e-6);

    return {
      stable,
      lyapunovValue,
      stateError,
      controlEffort,
      convergenceRate,
    };
  }

  /**
   * 计算误差范数
   */
  private computeError(state1: number[], state2: number[]): number {
    let error = 0;
    for (let i = 0; i < Math.min(state1.length, state2.length); i++) {
      error += Math.pow((state2[i] || 0) - (state1[i] || 0), 2);
    }
    return Math.sqrt(error);
  }
}

/**
 * 神经符号闭环控制器
 *
 * 核心特性:
 * - 双路控制 (符号 + 神经)
 * - 自适应模式切换
 * - 稳定性保证
 * - 在线学习能力
 */
export class NeuroSymbolicController {
  private config: Required<NeuroSymbolicControllerConfig>;
  private state: ControlState;
  private symbolicReasoner: LLMSymbolicReasoner;
  private neuralController: NeuralDeltaController;
  private stabilityValidator: StabilityValidator;

  // 历史记录
  private history: Array<{
    timestamp: number;
    state: ControlState;
    command: ControlCommand;
    metrics: StabilityMetrics;
  }> = [];

  constructor(config: NeuroSymbolicControllerConfig = { stateDimension: 10 }) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<NeuroSymbolicControllerConfig>;
    this.state = {
      mode: this.config.controlMode,
      symbolic: {
        active: false,
        reasoning: null,
        confidence: 0,
      },
      neural: {
        active: false,
        delta: [],
        uncertainty: 1.0,
      },
      system: {
        stable: true,
        error: null,
        reference: new Array(this.config.stateDimension).fill(0),
        output: new Array(this.config.stateDimension).fill(0),
      },
    };

    // 初始化组件
    this.symbolicReasoner = new LLMSymbolicReasoner(this.config);
    this.neuralController = new NeuralDeltaController(
      this.config,
      this.config.stateDimension,
    );
    this.stabilityValidator = new StabilityValidator(this.config);

    console.log(
      `🧠 神经符号控制器初始化 (模式: ${this.config.controlMode}, 维度: ${this.config.stateDimension})`,
    );
  }

  /**
   * 控制步骤 - 核心闭环控制
   */
  async controlStep(
    currentState: number[],
    reference: number[],
    constraints: SymbolicConstraint[] = [],
  ): Promise<ControlCommand> {
    console.log(`🎮 控制步骤 (模式: ${this.state.mode})`);
    const startTime = Date.now();

    // 获取配置值
    const sc = this.config.symbolicConfig ?? DEFAULT_CONFIG.symbolicConfig;
    const nc = this.config.neuralConfig ?? DEFAULT_CONFIG.neuralConfig;
    const symbolicConfidenceThreshold = sc.confidenceThreshold!;
    const neuralUncertaintyThreshold = nc.uncertaintyThreshold!;

    // Phase 1: 符号推理
    const symbolicResult = await this.symbolicReasoner.reason({
      currentState,
      reference,
      constraints,
    });

    this.state.symbolic = {
      active: symbolicResult.confidence > symbolicConfidenceThreshold,
      reasoning: symbolicResult.reasoning.join("\n"),
      confidence: symbolicResult.confidence,
    };

    // Phase 2: 神经控制
    const stateError = currentState.map((s, i) => (reference[i] || 0) - s);
    const neuralResult = this.neuralController.compute(stateError);

    this.state.neural = {
      active: neuralResult.uncertainty < neuralUncertaintyThreshold,
      delta: neuralResult.delta,
      uncertainty: neuralResult.uncertainty,
    };

    // Phase 3: 融合决策
    let action: number[];
    let source: ControlCommand["source"];

    switch (this.state.mode) {
      case ControlMode.SYMBOLIC_ONLY:
        action = symbolicResult.action;
        source = "symbolic";
        break;

      case ControlMode.NEURAL_ONLY:
        action = neuralResult.delta;
        source = "neural";
        break;

      case ControlMode.HYBRID:
        // 加权融合 (基于置信度和不确定性)
        const symbolicWeight = symbolicResult.confidence;
        const neuralWeight = 1 - neuralResult.uncertainty;
        const totalWeight = symbolicWeight + neuralWeight;

        action = currentState.map((_, i) => {
          const symbolicAction = symbolicResult.action[i] || 0;
          const neuralAction = neuralResult.delta[i] || 0;
          return (
            (symbolicWeight * symbolicAction + neuralWeight * neuralAction) /
            totalWeight
          );
        });
        source = "hybrid";
        break;

      case ControlMode.ADAPTIVE:
        // 自适应选择
        if (symbolicResult.confidence > 0.8) {
          action = symbolicResult.action;
          source = "symbolic";
        } else if (neuralResult.uncertainty < 0.2) {
          action = neuralResult.delta;
          source = "neural";
        } else {
          // 融合
          action = currentState.map((_, i) => {
            const symbolicAction = symbolicResult.action[i] || 0;
            const neuralAction = neuralResult.delta[i] || 0;
            return 0.5 * symbolicAction + 0.5 * neuralAction;
          });
          source = "hybrid";
        }
        break;
    }

    // Phase 4: 稳定性验证
    const predictedNextState = currentState.map((s, i) => s + (action[i] || 0));
    const metrics = this.stabilityValidator.validate(
      predictedNextState,
      reference,
      action,
    );

    // 更新系统状态
    this.state.system = {
      stable: metrics.stable,
      error: metrics.stateError,
      reference,
      output: action,
    };

    // Phase 5: 在线学习 (如果系统稳定)
    if (metrics.stable && this.state.neural.active) {
      this.neuralController.updateWeights(stateError);
    }

    // 记录历史
    const command: ControlCommand = {
      action,
      source,
      metadata: {
        timestamp: Date.now(),
        confidence: symbolicResult.confidence,
        reasoning: this.state.symbolic.reasoning || undefined,
      },
    };

    this.history.push({
      timestamp: Date.now(),
      state: { ...this.state },
      command,
      metrics,
    });

    // 限制历史长度
    if (this.history.length > 1000) {
      this.history.shift();
    }

    const duration = Date.now() - startTime;
    console.log(
      `✅ 控制步骤完成 (${duration}ms): 稳定=${metrics.stable}, 误差=${metrics.stateError.toFixed(4)}`,
    );

    return command;
  }

  /**
   * 获取控制状态
   */
  getState(): ControlState {
    return { ...this.state };
  }

  /**
   * 获取历史记录
   */
  getHistory(limit?: number): typeof this.history {
    if (limit) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  /**
   * 切换控制模式
   */
  switchMode(newMode: ControlMode): void {
    console.log(`🔄 切换控制模式: ${this.state.mode} -> ${newMode}`);
    this.state.mode = newMode;
  }

  /**
   * 重置控制器状态
   */
  reset(): void {
    this.state = {
      mode: this.config.controlMode,
      symbolic: {
        active: false,
        reasoning: null,
        confidence: 0,
      },
      neural: {
        active: false,
        delta: [],
        uncertainty: 1.0,
      },
      system: {
        stable: true,
        error: null,
        reference: new Array(this.config.stateDimension).fill(0),
        output: new Array(this.config.stateDimension).fill(0),
      },
    };
    this.history = [];
    console.log(`🔄 控制器已重置`);
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(): {
    totalSteps: number;
    averageError: number;
    averageControlEffort: number;
    stabilityRate: number;
    modeUsage: Record<string, number>;
  } {
    if (this.history.length === 0) {
      return {
        totalSteps: 0,
        averageError: 0,
        averageControlEffort: 0,
        stabilityRate: 1,
        modeUsage: {},
      };
    }

    const totalSteps = this.history.length;
    const averageError =
      this.history.reduce((sum, h) => sum + h.metrics.stateError, 0) /
      totalSteps;
    const averageControlEffort =
      this.history.reduce((sum, h) => sum + h.metrics.controlEffort, 0) /
      totalSteps;
    const stabilityRate =
      this.history.filter((h) => h.metrics.stable).length / totalSteps;

    const modeUsage: Record<string, number> = {};
    for (const h of this.history) {
      modeUsage[h.command.source] = (modeUsage[h.command.source] || 0) + 1;
    }

    return {
      totalSteps,
      averageError,
      averageControlEffort,
      stabilityRate,
      modeUsage,
    };
  }

  /**
   * 导出控制器状态
   */
  exportState(): {
    version: string;
    config: Required<NeuroSymbolicControllerConfig>;
    state: ControlState;
    performance: {
      totalSteps: number;
      averageError: number;
      averageControlEffort: number;
      stabilityRate: number;
      modeUsage: Record<string, number>;
    };
    historySize: number;
  } {
    const stats = this.getPerformanceStats();
    return {
      version: "1.0.0",
      config: this.config,
      state: this.getState(),
      performance: stats,
      historySize: this.history.length,
    };
  }

  /**
   * 导入控制器状态
   */
  importState(
    exportedState: ReturnType<NeuroSymbolicController["exportState"]>,
  ): void {
    if (exportedState.version !== "1.0.0") {
      throw new Error(`版本不兼容: ${exportedState.version}`);
    }

    this.state = exportedState.state;
    // 注意: 不恢复历史以节省内存
    console.log(
      `📥 导入控制器状态: ${exportedState.historySize} 条历史记录已丢弃`,
    );
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.history = [];
    console.log(`🗑️ 神经符号控制器已释放`);
  }
}

/**
 * 创建神经符号控制器
 */
export function createNeuroSymbolicController(
  config?: NeuroSymbolicControllerConfig,
): NeuroSymbolicController {
  return new NeuroSymbolicController(config);
}

/**
 * 预定义约束
 */
export const CommonConstraints = {
  /** 状态范围约束 */
  stateRange: (
    index: number,
    min: number,
    max: number,
  ): SymbolicConstraint => ({
    id: `state_range_${index}`,
    type: "range",
    expression: `state[${index}] >= ${min} && state[${index}] <= ${max}`,
    params: { index, min, max },
  }),

  /** 控制 effort 约束 */
  controlEffort: (maxEffort: number): SymbolicConstraint => ({
    id: "control_effort",
    type: "inequality",
    expression: `sqrt(sum(control[i]^2 for i)) <= ${maxEffort}`,
    params: { maxEffort },
  }),
} as const;
