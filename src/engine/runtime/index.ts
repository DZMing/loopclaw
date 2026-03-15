/**
 * 运行时模块统一导出
 *
 * 负责导出所有运行时子模块，提供统一的访问接口。
 *
 * @version 2.48.0
 * @since 2026-03-13
 * @author Claude Code
 */

// 运行时上下文管理
export { RuntimeContextManager } from "./runtime-context.js";
export type { EngineLogger } from "./runtime-context.js";

// 状态持久化
export {
  StatePersistenceManager,
  StateFileNames,
} from "./state-persistence.js";
export type { EngineState } from "./state-persistence.js";

// 报告和通知
export { ReportingManager } from "./reporting.js";
export type { ReportRecord } from "./reporting.js";

// MISSION/BOUNDARIES 文件操作
export {
  MissionManager,
  MissionFileNames,
  ErrorCategory,
} from "./mission-io.js";
export type { ErrorRecord } from "./mission-io.js";

// 代码分析
export { CodeAnalysisManager } from "./code-analysis.js";

// 循环引擎
export { LoopEngineManager, Constants } from "./loop-engine.js";
export type { ContextState, LoopMetrics } from "./loop-engine.js";

// 熔断器
export {
  CircuitBreaker,
  CircuitBreakerState,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "./circuit-breaker.js";
export type { CircuitBreakerConfig } from "./circuit-breaker.js";
