/**
 * 引擎配置
 */

/**
 * 配置验证错误
 */
export class ConfigValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly invalidValue: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

const NUMERIC_FIELDS = [
  "compressInterval",
  "persistInterval",
  "reportInterval",
  "cacheTTL",
  "stallThreshold",
  "healthCheckInterval",
  "maxActions",
  "maxErrors",
] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];

export const REPORT_TARGETS = ["state", "log", "telegram", "discord"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const LLM_PROVIDERS = [
  "openclaw",
  "openai",
  "anthropic",
  "ollama",
  "vllm",
  "custom",
] as const;
export type EngineLLMProvider = (typeof LLM_PROVIDERS)[number];

function hasOwn(config: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(config, field);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (isFiniteNumber(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function parseBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return undefined;
}

function readBoolean(
  config: Record<string, unknown>,
  field: string,
  envKey: string,
  defaultValue: boolean,
): boolean {
  if (hasOwn(config, field)) {
    const configured = parseBooleanValue(config[field]);
    if (configured === undefined) {
      throw new ConfigValidationError(
        field,
        config[field],
        `${field} 必须是布尔值，当前: ${String(config[field])}`,
      );
    }
    return configured;
  }

  const fromEnv = parseBooleanValue(process.env[envKey]);
  if (fromEnv !== undefined) {
    return fromEnv;
  }

  return defaultValue;
}

function readNumber(
  config: Record<string, unknown>,
  field: NumericField,
  envKey: string,
  defaultValue: number,
): number {
  if (hasOwn(config, field)) {
    const configured = parseFiniteNumber(config[field]);
    if (configured === undefined) {
      throw new ConfigValidationError(
        field,
        config[field],
        `${field} 必须是有限数字，当前: ${String(config[field])}`,
      );
    }
    return configured;
  }

  const fromEnv = parseFiniteNumber(process.env[envKey]);
  if (fromEnv !== undefined) {
    return fromEnv;
  }

  return defaultValue;
}

function parseOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readOptionalString(
  config: Record<string, unknown>,
  field: string,
  envKey: string,
): string | undefined {
  if (hasOwn(config, field)) {
    const configured = parseOptionalString(config[field]);
    if (config[field] != null && configured === undefined) {
      throw new ConfigValidationError(
        field,
        config[field],
        `${field} 必须是非空字符串，当前: ${String(config[field])}`,
      );
    }
    return configured;
  }

  return parseOptionalString(process.env[envKey]);
}

function readEnumValue<T extends string>(
  config: Record<string, unknown>,
  field: string,
  envKey: string,
  allowedValues: readonly T[],
  defaultValue: T,
): T {
  if (hasOwn(config, field)) {
    const configured = parseOptionalString(config[field]);
    if (!configured || !allowedValues.includes(configured as T)) {
      throw new ConfigValidationError(
        field,
        config[field],
        `${field} 必须是 ${allowedValues.join(", ")} 之一，当前: ${String(config[field])}`,
      );
    }
    return configured as T;
  }

  const fromEnv = parseOptionalString(process.env[envKey]);
  if (fromEnv && allowedValues.includes(fromEnv as T)) {
    return fromEnv as T;
  }

  return defaultValue;
}

/**
 * 验证配置值范围
 */
export function validateConfig(config: EngineConfig): void {
  const errors: string[] = [];

  for (const field of NUMERIC_FIELDS) {
    const value = config[field];
    if (!isFiniteNumber(value)) {
      errors.push(`${field} 必须是有限数字，当前: ${String(value)}`);
    }
  }

  // 验证循环间隔
  if (config.compressInterval < 1 || config.compressInterval > 100) {
    errors.push(
      `compressInterval 必须在 1-100 之间，当前: ${config.compressInterval}`,
    );
  }
  if (config.persistInterval < 1 || config.persistInterval > 1000) {
    errors.push(
      `persistInterval 必须在 1-1000 之间，当前: ${config.persistInterval}`,
    );
  }
  if (config.reportInterval < 1 || config.reportInterval > 1000) {
    errors.push(
      `reportInterval 必须在 1-1000 之间，当前: ${config.reportInterval}`,
    );
  }

  // 验证时间阈值
  if (config.cacheTTL < 100 || config.cacheTTL > 60000) {
    errors.push(`cacheTTL 必须在 100-60000ms 之间，当前: ${config.cacheTTL}`);
  }
  if (config.stallThreshold < 1000 || config.stallThreshold > 300000) {
    errors.push(
      `stallThreshold 必须在 1000-300000ms 之间，当前: ${config.stallThreshold}`,
    );
  }
  if (
    config.healthCheckInterval < 1000 ||
    config.healthCheckInterval > 300000
  ) {
    errors.push(
      `healthCheckInterval 必须在 1000-300000ms 之间，当前: ${config.healthCheckInterval}`,
    );
  }

  // 验证数量限制
  if (config.maxActions < 1 || config.maxActions > 1000) {
    errors.push(`maxActions 必须在 1-1000 之间，当前: ${config.maxActions}`);
  }
  if (config.maxErrors < 1 || config.maxErrors > 500) {
    errors.push(`maxErrors 必须在 1-500 之间，当前: ${config.maxErrors}`);
  }

  if (errors.length > 0) {
    throw new ConfigValidationError("multiple", config, errors.join("; "));
  }
}

export interface EngineConfig {
  // 循环配置
  readonly compressInterval: number; // 上下文压缩间隔（循环数）
  readonly persistInterval: number; // 状态持久化间隔（循环数）
  readonly reportInterval: number; // 汇报间隔（循环数）

  // 性能配置
  readonly cacheTTL: number; // 缓存生存时间（毫秒）
  readonly stallThreshold: number; // 卡死检测阈值（毫秒）
  readonly healthCheckInterval: number; // 健康检查间隔（毫秒）

  // 上下文限制
  readonly maxActions: number; // 最大行动记录数
  readonly maxErrors: number; // 最大错误记录数

  // 功能开关
  readonly enableHealthCheck: boolean; // 启用健康检查
  readonly enableMetrics: boolean; // 启用性能指标
  readonly enableCache: boolean; // 启用文件缓存

  // 汇报配置
  readonly reportTarget: ReportTarget;
  readonly reportChannel?: string;
  readonly telegramBotToken?: string; // Telegram bot token（可选，优先级高于环境变量）

  // LLM 配置
  readonly llmProvider: EngineLLMProvider;
  readonly llmModel?: string;
  readonly llmBaseURL?: string;
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: EngineConfig = {
  compressInterval: 3,
  persistInterval: 10,
  reportInterval: 10,
  cacheTTL: 5000,
  stallThreshold: 30000,
  healthCheckInterval: 15000,
  maxActions: 50,
  maxErrors: 20,
  enableHealthCheck: true,
  enableMetrics: true,
  enableCache: true,
  reportTarget: "state",
  reportChannel: undefined,
  telegramBotToken: undefined,
  llmProvider: "openclaw",
  llmModel: undefined,
  llmBaseURL: undefined,
};

/**
 * 从环境变量加载配置
 */
export function loadConfig(
  openclawConfig?: Record<string, unknown>,
): EngineConfig {
  const config = openclawConfig || {};
  const loadedConfig: EngineConfig = {
    ...DEFAULT_CONFIG,
    compressInterval: readNumber(
      config,
      "compressInterval",
      "LOBSTER_COMPRESS_INTERVAL",
      DEFAULT_CONFIG.compressInterval,
    ),
    persistInterval: readNumber(
      config,
      "persistInterval",
      "LOBSTER_PERSIST_INTERVAL",
      DEFAULT_CONFIG.persistInterval,
    ),
    reportInterval: readNumber(
      config,
      "reportInterval",
      "LOBSTER_REPORT_INTERVAL",
      DEFAULT_CONFIG.reportInterval,
    ),
    cacheTTL: readNumber(
      config,
      "cacheTTL",
      "LOBSTER_CACHE_TTL",
      DEFAULT_CONFIG.cacheTTL,
    ),
    stallThreshold: readNumber(
      config,
      "stallThreshold",
      "LOBSTER_STALL_THRESHOLD",
      DEFAULT_CONFIG.stallThreshold,
    ),
    healthCheckInterval: readNumber(
      config,
      "healthCheckInterval",
      "LOBSTER_HEALTH_CHECK_INTERVAL",
      DEFAULT_CONFIG.healthCheckInterval,
    ),
    maxActions: readNumber(
      config,
      "maxActions",
      "LOBSTER_MAX_ACTIONS",
      DEFAULT_CONFIG.maxActions,
    ),
    maxErrors: readNumber(
      config,
      "maxErrors",
      "LOBSTER_MAX_ERRORS",
      DEFAULT_CONFIG.maxErrors,
    ),
    enableHealthCheck: readBoolean(
      config,
      "enableHealthCheck",
      "LOBSTER_HEALTH_CHECK",
      DEFAULT_CONFIG.enableHealthCheck,
    ),
    enableMetrics: readBoolean(
      config,
      "enableMetrics",
      "LOBSTER_METRICS",
      DEFAULT_CONFIG.enableMetrics,
    ),
    enableCache: readBoolean(
      config,
      "enableCache",
      "LOBSTER_CACHE",
      DEFAULT_CONFIG.enableCache,
    ),
    reportTarget: readEnumValue(
      config,
      "reportTarget",
      "LOBSTER_REPORT_TARGET",
      REPORT_TARGETS,
      DEFAULT_CONFIG.reportTarget,
    ),
    reportChannel: readOptionalString(
      config,
      "reportChannel",
      "LOBSTER_REPORT_CHANNEL",
    ),
    telegramBotToken: readOptionalString(
      config,
      "telegramBotToken",
      "TELEGRAM_BOT_TOKEN",
    ),
    llmProvider: readEnumValue(
      config,
      "llmProvider",
      "LLM_PROVIDER",
      LLM_PROVIDERS,
      DEFAULT_CONFIG.llmProvider,
    ),
    llmModel: readOptionalString(config, "llmModel", "LLM_MODEL"),
    llmBaseURL: readOptionalString(config, "llmBaseURL", "LLM_BASE_URL"),
  };

  validateConfig(loadedConfig);
  return loadedConfig;
}
