/**
 * 🦞 龙虾永动引擎 - 核心模块导出
 *
 * 精简版本，只导出实际使用的模块：
 * - 零延迟循环引擎
 * - 代码分析器
 * - 通知系统
 * - LLM 提供商抽象
 * - 永动引擎服务
 * - 运行时模块
 *
 * @version 2.48.0
 * @since 2026-03-13
 * @author Claude Code
 */

// ========== 零延迟循环引擎 ==========
export {
  ZeroLatencyLoopEngine,
  EventLoopMetrics,
  ZeroLatencyLoopOptions,
  createZeroLatencyLoop,
  MicrotaskBatcher,
  createMicrotaskBatcher,
  NonBlockingExecutor,
} from "./zero-latency-loop.js";

// ========== 代码分析器 ==========
export {
  LobsterCodeAnalyzer,
  quickAnalyze,
  CodeQualityReport,
  IssueSeverity,
  CodeIssueType,
} from "./code-analyzer.js";

// ========== AST 缓存 ==========
export {
  FileAnalysisCache,
  LRUCache,
  memoize,
  memoizeAsync,
  IncrementalAnalysisConfig,
  createIncrementalConfig,
} from "./ast-cache.js";

// ========== 任务规划器 ==========
export {
  AutonomousTaskPlanner,
  AutonomousTask,
  TaskExecution,
  PlanningResult,
  createPlanner,
} from "./task-planner.js";

// ========== 代码修复器 ==========
export {
  LobsterCodeFixer,
  FixType,
  FixResult,
  FixReport,
} from "./code-fixer.js";

// ========== 通知系统 ==========
export {
  Notifier,
  NotificationChannel,
  NotificationLevel,
  NotificationMessage,
  DiscordConfig,
  TelegramConfig,
  NotifierConfig,
  createNotifier,
  createNotifierFromEnv,
} from "./notifier.js";

// ========== LLM 提供商 ==========
export {
  LLMProvider,
  ModelConfig,
  LLMRequest,
  LLMResponse,
  ILLMProvider,
  OpenAIProvider,
  AnthropicProvider,
  OpenClawProvider,
  OllamaProvider,
  LLMFactory,
  generateText,
  streamText,
} from "./llm-provider.js";

// ========== 永动引擎服务 ==========
export { PerpetualEngineService } from "./service.js";

// ========== 运行时模块 ==========
export { RuntimeContextManager } from "./runtime/runtime-context.js";
export type { EngineLogger } from "./runtime/runtime-context.js";

export {
  StatePersistenceManager,
  StateFileNames,
} from "./runtime/state-persistence.js";
export type { EngineState } from "./runtime/state-persistence.js";

export { ReportingManager } from "./runtime/reporting.js";
export type { ReportRecord } from "./runtime/reporting.js";

export {
  MissionManager,
  MissionFileNames,
  ErrorCategory,
} from "./runtime/mission-io.js";
export type { ErrorRecord } from "./runtime/mission-io.js";

export { CodeAnalysisManager } from "./runtime/code-analysis.js";

export { LoopEngineManager, Constants } from "./runtime/loop-engine.js";
export type { ContextState, LoopMetrics } from "./runtime/loop-engine.js";

/**
 * 🦞 引擎版本信息
 */
export const ENGINE_VERSION = "2.48.0";

/**
 * 🦞 引擎功能矩阵（精简版）
 */
export const ENGINE_FEATURES = {
  zeroLatencyLoop: true,
  codeAnalysis: true,
  notificationSystem: true,
  llmProviderAbstraction: true,
  statePersistence: true,
  contextCompression: true,
  errorRecovery: true,
  healthCheck: true,
} as const;
