/**
 * OpenClaw 插件类型定义（本地副本）
 *
 * 从 OpenClaw 源码复制，确保类型安全
 */

export interface PluginLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface OpenClawConfig {
  [key: string]: unknown;
}

export interface OpenClawPluginServiceContext {
  config: OpenClawConfig;
  workspaceDir?: string;
  stateDir: string;
  logger: PluginLogger;
}

export interface OpenClawPluginCommandDefinition {
  name: string;
  description: string;
  requireAuth?: boolean;
  acceptsArgs?: boolean; // v2.48: 声明命令是否接受参数
  handler: (
    ctx: PluginCommandContext,
  ) => PluginCommandResult | Promise<PluginCommandResult>;
}

export interface PluginCommandContext {
  senderId?: string;
  channel: string;
  isAuthorizedSender: boolean;
  args?: string;
  commandBody: string;
  config: OpenClawConfig;
}

export interface PluginCommandResult {
  text?: string;
  channelId?: string;
}

export interface OpenClawPluginService {
  id: string;
  start: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
  stop?: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
}

export interface PluginHookEvent {
  port?: number;
  reason?: string;
}

export type PluginHookName =
  | "gateway_start"
  | "gateway_pre_stop"
  | "gateway_stop";

// v2.48: HTTP 路由相关类型
export interface HttpRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: any;
}

export interface HttpResponse {
  json: (data: any) => void;
  send: (data: any) => void;
  statusCode: number;
  setHeader: (name: string, value: string) => void;
}

export interface HttpRoute {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  handler: (req: HttpRequest, res: HttpResponse) => void | Promise<void>;
}

// v2.48: Gateway RPC 方法相关类型
export interface GatewayMethod {
  name: string;
  description: string;
  handler: (...args: unknown[]) => unknown | Promise<unknown>;
  // handler 支持多种签名：
  // - 无参数: () => T
  // - 单参数: (arg: A) => T
  // - 多参数: (arg1: A, arg2: B, ...) => T
}

export interface OpenClawPluginApi {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: OpenClawRuntime; // v2.48: 正确类型的 runtime
  logger: PluginLogger;
  registerService: (service: OpenClawPluginService) => void;
  registerCommand: (command: OpenClawPluginCommandDefinition) => void;
  registerHttpRoute?: (route: HttpRoute) => void; // v2.48: HTTP 路由注册（可选）
  registerGatewayMethod?: (method: GatewayMethod) => void; // v2.48: Gateway RPC 方法注册（可选）
  on: <K extends PluginHookName>(
    hookName: K,
    handler: (event: any, ctx: any) => void | Promise<void>,
    opts?: { priority?: number },
  ) => void;
}

// v2.48: Runtime TTS/STT 语音功能类型
export interface TTSCapabilities {
  textToSpeechTelephony: (
    text: string,
    options?: TTSOptions,
  ) => Promise<Buffer>;
}

export interface STTCapabilities {
  transcribeAudioFile: (
    audioPath: string,
    options?: STTOptions,
  ) => Promise<string>;
}

export interface TTSOptions {
  language?: string;
  voice?: string;
  rate?: number;
  pitch?: number;
}

export interface STTOptions {
  language?: string;
  model?: string;
}

export interface OpenClawRuntime {
  tts?: TTSCapabilities;
  stt?: STTCapabilities;
}

// LLM Agent 接口（为未来集成准备）
export interface LLMAgentConfig {
  provider: "anthropic" | "openai" | "custom";
  model?: string;
  apiKey?: string;
  baseURL?: string;
}

export interface AgentDecision {
  description: string;
  type: "analyze" | "execute" | "report" | "wait";
  confidence: number;
  reasoning?: string;
}
