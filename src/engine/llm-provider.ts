/**
 * 🤖 LLM 提供商抽象层
 *
 * 统一支持多个远程或本地模型端点，并返回一致的响应结构。
 */

export enum LLMProvider {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  OPENCLAW = "openclaw",
  OLLAMA = "ollama",
  VLLM = "vllm",
  CUSTOM = "custom",
}

export interface ModelConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  messages?: Array<{ role: string; content: string }>;
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  toolCalls?: Array<{
    id: string;
    name: string;
    parameters: Record<string, unknown>;
  }>;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: Array<{
    id: string;
    name: string;
    parameters: Record<string, unknown>;
  }>;
  model?: string;
  raw?: unknown;
}

export interface ILLMProvider {
  readonly provider: LLMProvider;
  readonly model: string;
  generate(request: LLMRequest): Promise<LLMResponse>;
  stream(
    request: LLMRequest,
    onChunk: (chunk: string) => void,
  ): Promise<LLMResponse>;
}

type ChatMessage = {
  role: string;
  content: string;
};

function normalizeBaseURL(baseURL: string): string {
  return baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
}

function parseFiniteNumber(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function assertApiKey(config: ModelConfig): string {
  if (!config.apiKey) {
    throw new Error(`API key is required for provider "${config.provider}"`);
  }
  return config.apiKey;
}

function assertBaseURL(config: ModelConfig): string {
  if (!config.baseURL) {
    throw new Error(`baseURL is required for provider "${config.provider}"`);
  }
  return normalizeBaseURL(config.baseURL);
}

function buildChatMessages(request: LLMRequest): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt });
  }

  for (const message of request.messages ?? []) {
    messages.push({
      role: message.role,
      content: message.content,
    });
  }

  messages.push({ role: "user", content: request.prompt });
  return messages;
}

function buildAnthropicMessages(request: LLMRequest): ChatMessage[] {
  return buildChatMessages(request).filter(
    (message) => message.role !== "system",
  );
}

function buildOpenAIHeaders(config: ModelConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${assertApiKey(config)}`,
    "Content-Type": "application/json",
    ...config.headers,
  };
}

function buildAnthropicHeaders(config: ModelConfig): Record<string, string> {
  return {
    "x-api-key": assertApiKey(config),
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
    ...config.headers,
  };
}

function buildOptionalBearerHeaders(
  config: ModelConfig,
): Record<string, string> {
  return {
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    "Content-Type": "application/json",
    ...config.headers,
  };
}

async function postJSON(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `HTTP ${response.status}: ${errorBody || response.statusText}`,
    );
  }

  return response;
}

async function parseJSONResponse(response: Response): Promise<unknown> {
  return response.json();
}

function parseOpenAICompatibleUsage(
  raw: any,
): LLMResponse["usage"] | undefined {
  if (!raw?.usage) {
    return undefined;
  }

  return {
    promptTokens: raw.usage.prompt_tokens ?? 0,
    completionTokens: raw.usage.completion_tokens ?? 0,
    totalTokens:
      raw.usage.total_tokens ??
      (raw.usage.prompt_tokens ?? 0) + (raw.usage.completion_tokens ?? 0),
  };
}

function parseAnthropicUsage(raw: any): LLMResponse["usage"] | undefined {
  if (!raw?.usage) {
    return undefined;
  }

  const promptTokens = raw.usage.input_tokens ?? 0;
  const completionTokens = raw.usage.output_tokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function parseOpenAIToolCalls(raw: any): LLMResponse["toolCalls"] | undefined {
  const toolCalls = raw?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return undefined;
  }

  return toolCalls.map((toolCall: any) => ({
    id: toolCall.id,
    name: toolCall.function?.name ?? "unknown",
    parameters: JSON.parse(toolCall.function?.arguments ?? "{}"),
  }));
}

function parseOpenAICompatibleResponse(raw: any): LLMResponse {
  return {
    content: raw?.choices?.[0]?.message?.content ?? "",
    usage: parseOpenAICompatibleUsage(raw),
    toolCalls: parseOpenAIToolCalls(raw),
    model: raw?.model,
    raw,
  };
}

function parseAnthropicResponse(raw: any): LLMResponse {
  const content = Array.isArray(raw?.content)
    ? raw.content
        .filter((block: any) => block?.type === "text")
        .map((block: any) => block.text ?? "")
        .join("")
    : "";

  return {
    content,
    usage: parseAnthropicUsage(raw),
    model: raw?.model,
    raw,
  };
}

function parseOllamaResponse(raw: any): LLMResponse {
  const promptTokens = raw?.prompt_eval_count ?? 0;
  const completionTokens = raw?.eval_count ?? 0;

  return {
    content: raw?.response ?? "",
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    model: raw?.model,
    raw,
  };
}

async function consumeSSE(
  response: Response,
  onEvent: (data: string) => void,
): Promise<void> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const eventBlock = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      for (const line of eventBlock.split("\n")) {
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload && payload !== "[DONE]") {
            onEvent(payload);
          }
        }
      }

      separatorIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }
}

async function consumeNDJSON(
  response: Response,
  onLine: (line: string) => void,
): Promise<void> {
  if (!response.body) {
    const text = await response.text();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        onLine(trimmed);
      }
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        onLine(line);
      }
      newlineIndex = buffer.indexOf("\n");
    }

    if (done) {
      const lastLine = buffer.trim();
      if (lastLine) {
        onLine(lastLine);
      }
      break;
    }
  }
}

abstract class BaseProvider implements ILLMProvider {
  abstract readonly provider: LLMProvider;
  readonly model: string;
  protected readonly config: ModelConfig;

  constructor(config: ModelConfig) {
    this.model = config.model;
    this.config = config;
  }

  protected get timeout(): number {
    return this.config.timeout ?? 30_000;
  }

  abstract generate(request: LLMRequest): Promise<LLMResponse>;
  abstract stream(
    request: LLMRequest,
    onChunk: (chunk: string) => void,
  ): Promise<LLMResponse>;
}

export class OpenAIProvider extends BaseProvider {
  readonly provider = LLMProvider.OPENAI;

  private get baseURL(): string {
    return normalizeBaseURL(this.config.baseURL ?? "https://api.openai.com/v1");
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const response = await postJSON(
      `${this.baseURL}/chat/completions`,
      {
        model: this.model,
        messages: buildChatMessages(request),
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        tools: request.tools,
      },
      buildOpenAIHeaders(this.config),
      this.timeout,
    );

    return parseOpenAICompatibleResponse(await parseJSONResponse(response));
  }

  async stream(
    request: LLMRequest,
    onChunk: (chunk: string) => void,
  ): Promise<LLMResponse> {
    const response = await postJSON(
      `${this.baseURL}/chat/completions?stream=true`,
      {
        model: this.model,
        messages: buildChatMessages(request),
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        tools: request.tools,
        stream: true,
      },
      buildOpenAIHeaders(this.config),
      this.timeout,
    );

    let content = "";

    await consumeSSE(response, (payload) => {
      const json = JSON.parse(payload);
      const chunk = json?.choices?.[0]?.delta?.content;
      if (typeof chunk === "string" && chunk.length > 0) {
        content += chunk;
        onChunk(chunk);
      }
    });

    return {
      content,
      model: this.model,
    };
  }
}

export class AnthropicProvider extends BaseProvider {
  readonly provider = LLMProvider.ANTHROPIC;

  private get baseURL(): string {
    return normalizeBaseURL(this.config.baseURL ?? "https://api.anthropic.com");
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const response = await postJSON(
      `${this.baseURL}/v1/messages`,
      {
        model: this.model,
        system: request.systemPrompt,
        messages: buildAnthropicMessages(request),
        max_tokens: this.config.maxTokens ?? 1024,
        temperature: this.config.temperature,
      },
      buildAnthropicHeaders(this.config),
      this.timeout,
    );

    return parseAnthropicResponse(await parseJSONResponse(response));
  }

  async stream(
    request: LLMRequest,
    onChunk: (chunk: string) => void,
  ): Promise<LLMResponse> {
    const response = await postJSON(
      `${this.baseURL}/v1/messages`,
      {
        model: this.model,
        system: request.systemPrompt,
        messages: buildAnthropicMessages(request),
        max_tokens: this.config.maxTokens ?? 1024,
        temperature: this.config.temperature,
        stream: true,
      },
      buildAnthropicHeaders(this.config),
      this.timeout,
    );

    let content = "";

    await consumeSSE(response, (payload) => {
      const json = JSON.parse(payload);
      const chunk = json?.delta?.text ?? json?.content_block?.text;
      if (typeof chunk === "string" && chunk.length > 0) {
        content += chunk;
        onChunk(chunk);
      }
    });

    return {
      content,
      model: this.model,
    };
  }
}

export class OpenClawProvider extends BaseProvider {
  readonly provider = LLMProvider.OPENCLAW;

  private get baseURL(): string {
    return assertBaseURL(this.config);
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const response = await postJSON(
      `${this.baseURL}/chat/completions`,
      {
        model: this.model,
        messages: buildChatMessages(request),
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        tools: request.tools,
      },
      buildOptionalBearerHeaders(this.config),
      this.timeout,
    );

    return parseOpenAICompatibleResponse(await parseJSONResponse(response));
  }

  async stream(
    request: LLMRequest,
    onChunk: (chunk: string) => void,
  ): Promise<LLMResponse> {
    const response = await postJSON(
      `${this.baseURL}/chat/completions?stream=true`,
      {
        model: this.model,
        messages: buildChatMessages(request),
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        tools: request.tools,
        stream: true,
      },
      buildOptionalBearerHeaders(this.config),
      this.timeout,
    );

    let content = "";

    await consumeSSE(response, (payload) => {
      const json = JSON.parse(payload);
      const chunk = json?.choices?.[0]?.delta?.content;
      if (typeof chunk === "string" && chunk.length > 0) {
        content += chunk;
        onChunk(chunk);
      }
    });

    return {
      content,
      model: this.model,
    };
  }
}

export class OllamaProvider extends BaseProvider {
  readonly provider = LLMProvider.OLLAMA;

  private get baseURL(): string {
    return normalizeBaseURL(this.config.baseURL ?? "http://127.0.0.1:11434");
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const response = await postJSON(
      `${this.baseURL}/api/generate`,
      {
        model: this.model,
        prompt: request.prompt,
        system: request.systemPrompt,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
        },
      },
      {
        "Content-Type": "application/json",
        ...this.config.headers,
      },
      this.timeout,
    );

    return parseOllamaResponse(await parseJSONResponse(response));
  }

  async stream(
    request: LLMRequest,
    onChunk: (chunk: string) => void,
  ): Promise<LLMResponse> {
    const response = await postJSON(
      `${this.baseURL}/api/generate`,
      {
        model: this.model,
        prompt: request.prompt,
        system: request.systemPrompt,
        stream: true,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
        },
      },
      {
        "Content-Type": "application/json",
        ...this.config.headers,
      },
      this.timeout,
    );

    let content = "";

    await consumeNDJSON(response, (line) => {
      const json = JSON.parse(line);
      const chunk = json?.response;
      if (typeof chunk === "string" && chunk.length > 0) {
        content += chunk;
        onChunk(chunk);
      }
    });

    return {
      content,
      model: this.model,
    };
  }
}

export class LLMFactory {
  private static providers = new Map<string, ILLMProvider>();

  static create(config: ModelConfig): ILLMProvider {
    const key = `${config.provider}:${config.model}:${config.baseURL ?? ""}`;
    const existing = this.providers.get(key);
    if (existing) {
      return existing;
    }

    let provider: ILLMProvider;

    switch (config.provider) {
      case LLMProvider.OPENAI:
        provider = new OpenAIProvider(config);
        break;
      case LLMProvider.ANTHROPIC:
        provider = new AnthropicProvider(config);
        break;
      case LLMProvider.OPENCLAW:
        provider = new OpenClawProvider(config);
        break;
      case LLMProvider.OLLAMA:
        provider = new OllamaProvider(config);
        break;
      case LLMProvider.VLLM:
      case LLMProvider.CUSTOM:
        provider = new OpenAIProvider({
          ...config,
          provider: LLMProvider.OPENAI,
        });
        break;
      default:
        throw new Error(`不支持的提供商: ${config.provider}`);
    }

    this.providers.set(key, provider);
    return provider;
  }

  static createFromEnv(provider?: LLMProvider, model?: string): ILLMProvider {
    const resolvedProvider =
      provider ??
      (process.env.LLM_PROVIDER as LLMProvider) ??
      LLMProvider.ANTHROPIC;
    const resolvedModel =
      model ?? process.env.LLM_MODEL ?? "claude-sonnet-4-20250514";

    const config: ModelConfig = {
      provider: resolvedProvider,
      model: resolvedModel,
      apiKey: process.env.LLM_API_KEY,
      baseURL: process.env.LLM_BASE_URL,
      maxTokens: parseFiniteNumber(process.env.LLM_MAX_TOKENS, 4096),
      temperature: parseFiniteNumber(process.env.LLM_TEMPERATURE, 0.7),
      timeout: parseFiniteNumber(process.env.LLM_TIMEOUT_MS, 30_000),
    };

    return this.create(config);
  }

  static clearCache(): void {
    this.providers.clear();
  }
}

export async function generateText(
  prompt: string,
  config?: ModelConfig,
): Promise<string> {
  const provider = config
    ? LLMFactory.create(config)
    : LLMFactory.createFromEnv();
  const response = await provider.generate({ prompt });
  return response.content;
}

export async function streamText(
  prompt: string,
  onChunk: (chunk: string) => void,
  config?: ModelConfig,
): Promise<string> {
  const provider = config
    ? LLMFactory.create(config)
    : LLMFactory.createFromEnv();
  const response = await provider.stream({ prompt }, onChunk);
  return response.content;
}
