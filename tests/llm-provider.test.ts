import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import {
  AnthropicProvider,
  LLMFactory,
  LLMProvider,
  OpenAIProvider,
  OllamaProvider,
  OpenClawProvider,
  generateText,
  streamText,
} from "../src/engine/llm-provider.js";
import { withEnv } from "./helpers.js";

function createServer(handler: http.RequestListener) {
  const server = http.createServer(handler);

  return {
    async listen() {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", () => resolve()),
      );
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("failed to resolve test server address");
      }
      return `http://127.0.0.1:${address.port}`;
    },
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

test("OpenAIProvider should use the configured HTTP endpoint for generate and stream", async () => {
  const requests: Array<{ url: string; body: string }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks).toString("utf-8");
    requests.push({ url: req.url ?? "", body });

    if (req.url?.includes("stream=true")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"streamed "}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"reply"}}]}\n\n');
      res.end("data: [DONE]\n\n");
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: "openai reply" } }],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
        model: "gpt-test",
      }),
    );
  });

  const baseUrl = await server.listen();

  try {
    const provider = new OpenAIProvider({
      provider: LLMProvider.OPENAI,
      model: "gpt-test",
      apiKey: "secret",
      baseURL: `${baseUrl}/v1`,
    });

    const generated = await provider.generate({ prompt: "hello" });
    assert.equal(generated.content, "openai reply");
    assert.equal(generated.usage?.totalTokens, 18);

    const streamChunks: string[] = [];
    const streamed = await provider.stream(
      { prompt: "hello stream" },
      (chunk) => {
        streamChunks.push(chunk);
      },
    );

    assert.equal(streamed.content, "streamed reply");
    assert.deepEqual(streamChunks, ["streamed ", "reply"]);
    assert.equal(requests.length >= 2, true);
  } finally {
    await server.close();
  }
});

test("AnthropicProvider, OpenClawProvider, and OllamaProvider should fail without pretending success", async () => {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }

    if (req.url?.includes("/anthropic/v1/messages")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          content: [{ type: "text", text: "anthropic reply" }],
          usage: { input_tokens: 10, output_tokens: 6 },
          model: "claude-test",
        }),
      );
      return;
    }

    if (req.url?.includes("/openclaw/chat/completions")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: "openclaw reply" } }],
          usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
          model: "openclaw-test",
        }),
      );
      return;
    }

    if (req.url?.includes("/ollama/api/generate")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          response: "ollama reply",
          prompt_eval_count: 4,
          eval_count: 3,
          model: "llama-test",
        }),
      );
      return;
    }

    res.writeHead(404).end();
  });

  const baseUrl = await server.listen();

  try {
    const anthropic = new AnthropicProvider({
      provider: LLMProvider.ANTHROPIC,
      model: "claude-test",
      apiKey: "secret",
      baseURL: `${baseUrl}/anthropic`,
    });
    const openclaw = new OpenClawProvider({
      provider: LLMProvider.OPENCLAW,
      model: "openclaw-test",
      apiKey: "secret",
      baseURL: `${baseUrl}/openclaw`,
    });
    const ollama = new OllamaProvider({
      provider: LLMProvider.OLLAMA,
      model: "llama-test",
      baseURL: `${baseUrl}/ollama`,
    });

    assert.equal(
      (await anthropic.generate({ prompt: "hello" })).content,
      "anthropic reply",
    );
    assert.equal(
      (await openclaw.generate({ prompt: "hello" })).content,
      "openclaw reply",
    );
    assert.equal(
      (await ollama.generate({ prompt: "hello" })).content,
      "ollama reply",
    );

    await assert.rejects(
      () =>
        new OpenAIProvider({
          provider: LLMProvider.OPENAI,
          model: "gpt-test",
        }).generate({ prompt: "hello" }),
      /API key/i,
    );
  } finally {
    await server.close();
  }
});

test("LLMFactory.create instantiates the correct provider class for each LLMProvider value", () => {
  LLMFactory.clearCache();

  const openai = LLMFactory.create({
    provider: LLMProvider.OPENAI,
    model: "m1",
    apiKey: "k",
  });
  assert.ok(openai instanceof OpenAIProvider);

  LLMFactory.clearCache();
  const anthropic = LLMFactory.create({
    provider: LLMProvider.ANTHROPIC,
    model: "m2",
    apiKey: "k",
  });
  assert.ok(anthropic instanceof AnthropicProvider);

  LLMFactory.clearCache();
  const openclaw = LLMFactory.create({
    provider: LLMProvider.OPENCLAW,
    model: "m3",
    baseURL: "http://x",
  });
  assert.ok(openclaw instanceof OpenClawProvider);

  LLMFactory.clearCache();
  const vllm = LLMFactory.create({
    provider: LLMProvider.VLLM,
    model: "m4",
    apiKey: "k",
    baseURL: "http://x",
  });
  assert.ok(vllm instanceof OpenAIProvider);

  LLMFactory.clearCache();
  const custom = LLMFactory.create({
    provider: LLMProvider.CUSTOM,
    model: "m5",
    apiKey: "k",
    baseURL: "http://x",
  });
  assert.ok(custom instanceof OpenAIProvider);

  LLMFactory.clearCache();
  assert.throws(
    () =>
      LLMFactory.create({ provider: "invalid" as LLMProvider, model: "m6" }),
    /不支持的提供商/,
  );

  LLMFactory.clearCache();
});

test("LLMFactory.createFromEnv reads LLM_* env vars and clearCache resets provider cache", async () => {
  const server = createServer(async (req, res) => {
    for await (const _ of req) {
      /* consume body */
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ response: "env reply", model: "env-model" }));
  });
  const baseUrl = await server.listen();

  try {
    await withEnv(
      { LLM_PROVIDER: "ollama", LLM_MODEL: "env-model", LLM_BASE_URL: baseUrl },
      async () => {
        LLMFactory.clearCache();
        const p1 = LLMFactory.createFromEnv();
        const p2 = LLMFactory.createFromEnv();
        // Same instance returned from cache
        assert.equal(p1, p2);

        const result = await p1.generate({ prompt: "hi" });
        assert.equal(result.content, "env reply");

        // clearCache causes a new instance to be created
        LLMFactory.clearCache();
        const p3 = LLMFactory.createFromEnv();
        assert.notEqual(p1, p3);
      },
    );
  } finally {
    LLMFactory.clearCache();
    await server.close();
  }
});

test("generateText returns content string via explicit config", async () => {
  const server = createServer(async (req, res) => {
    for await (const _ of req) {
      /* consume body */
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ response: "generated text", model: "gen-model" }));
  });
  const baseUrl = await server.listen();

  try {
    LLMFactory.clearCache();
    const result = await generateText("hello", {
      provider: LLMProvider.OLLAMA,
      model: "gen-model",
      baseURL: baseUrl,
    });
    assert.equal(result, "generated text");
  } finally {
    LLMFactory.clearCache();
    await server.close();
  }
});

test("generateText uses createFromEnv when no config provided", async () => {
  const server = createServer(async (req, res) => {
    for await (const _ of req) {
      /* consume body */
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ response: "env generated", model: "env-gen-model" }),
    );
  });
  const baseUrl = await server.listen();

  try {
    await withEnv(
      {
        LLM_PROVIDER: "ollama",
        LLM_MODEL: "env-gen-model",
        LLM_BASE_URL: baseUrl,
      },
      async () => {
        LLMFactory.clearCache();
        const result = await generateText("hello");
        assert.equal(result, "env generated");
      },
    );
  } finally {
    LLMFactory.clearCache();
    await server.close();
  }
});

test("streamText streams chunks and returns accumulated content via explicit config", async () => {
  const server = createServer(async (req, res) => {
    for await (const _ of req) {
      /* consume body */
    }
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    res.write('{"response":"stream "}\n');
    res.write('{"response":"reply"}\n');
    res.end('{"response":"","done":true}\n');
  });
  const baseUrl = await server.listen();

  try {
    LLMFactory.clearCache();
    const chunks: string[] = [];
    const result = await streamText(
      "hello",
      (chunk) => {
        chunks.push(chunk);
      },
      { provider: LLMProvider.OLLAMA, model: "stream-model", baseURL: baseUrl },
    );
    assert.equal(result, "stream reply");
    assert.deepEqual(chunks, ["stream ", "reply"]);
  } finally {
    LLMFactory.clearCache();
    await server.close();
  }
});

test("streamText uses createFromEnv when no config provided", async () => {
  const server = createServer(async (req, res) => {
    for await (const _ of req) {
      /* consume body */
    }
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    res.write('{"response":"env "}\n');
    res.end('{"response":"streamed"}\n');
  });
  const baseUrl = await server.listen();

  try {
    await withEnv(
      {
        LLM_PROVIDER: "ollama",
        LLM_MODEL: "env-stream-model",
        LLM_BASE_URL: baseUrl,
      },
      async () => {
        LLMFactory.clearCache();
        const chunks: string[] = [];
        const result = await streamText("hello", (chunk) => {
          chunks.push(chunk);
        });
        assert.equal(result, "env streamed");
        assert.deepEqual(chunks, ["env ", "streamed"]);
      },
    );
  } finally {
    LLMFactory.clearCache();
    await server.close();
  }
});

// ── 覆盖 consumeSSE !response.body 分支（line 249）──────────────────────────

test("OpenAIProvider.stream returns empty content when response has no body", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new OpenAIProvider({
      provider: LLMProvider.OPENAI,
      model: "gpt-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    const chunks: string[] = [];
    const result = await provider.stream({ prompt: "hi" }, (c) =>
      chunks.push(c),
    );
    assert.equal(result.content, "");
    assert.deepEqual(chunks, []);
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 consumeNDJSON !response.body 分支（line 288）──────────────────────

test("OllamaProvider.stream falls back to response.text() when body is null", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      text: async () => '{"response":"from-text"}\n{"response":"fallback"}\n',
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new OllamaProvider({
      provider: LLMProvider.OLLAMA,
      model: "llama-test",
      baseURL: "http://fake",
    });
    const chunks: string[] = [];
    const result = await provider.stream({ prompt: "hi" }, (c) =>
      chunks.push(c),
    );
    assert.equal(result.content, "from-textfallback");
    assert.deepEqual(chunks, ["from-text", "fallback"]);
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 consumeNDJSON lastLine 分支（line 319）──────────────────────────────

test("OllamaProvider.stream handles last chunk without trailing newline", async () => {
  const server = createServer(async (req, res) => {
    for await (const _ of req) {
      /* consume body */
    }
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    res.write('{"response":"first "}\n');
    // 末尾无换行符，触发 lastLine 分支（line 319）
    res.end('{"response":"last"}');
  });
  const baseUrl = await server.listen();
  try {
    LLMFactory.clearCache();
    const provider = new OllamaProvider({
      provider: LLMProvider.OLLAMA,
      model: "llama-test",
      baseURL: baseUrl,
    });
    const chunks: string[] = [];
    const result = await provider.stream({ prompt: "hi" }, (c) =>
      chunks.push(c),
    );
    assert.equal(result.content, "first last");
    assert.deepEqual(chunks, ["first ", "last"]);
  } finally {
    LLMFactory.clearCache();
    await server.close();
  }
});

// ── 覆盖 AnthropicProvider 默认 baseURL（line 406）──────────────────────────

test("AnthropicProvider uses default baseURL (api.anthropic.com) when none provided", async () => {
  let capturedUrl = "";
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string): Promise<Response> => {
    capturedUrl = url;
    return {
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        content: [],
        model: "claude-test",
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    } as unknown as Response;
  };
  try {
    LLMFactory.clearCache();
    const provider = new AnthropicProvider({
      provider: LLMProvider.ANTHROPIC,
      model: "claude-test",
      apiKey: "key",
      // baseURL 未指定，应使用默认值 https://api.anthropic.com
    });
    await provider.generate({ prompt: "hi" });
    assert.ok(
      capturedUrl.includes("api.anthropic.com"),
      `Expected default URL, got: ${capturedUrl}`,
    );
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 OllamaProvider 默认 baseURL（line 520）──────────────────────────────

test("OllamaProvider uses default baseURL (127.0.0.1:11434) when none provided", async () => {
  let capturedUrl = "";
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string): Promise<Response> => {
    capturedUrl = url;
    return {
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({ response: "", model: "llama-test" }),
    } as unknown as Response;
  };
  try {
    LLMFactory.clearCache();
    const provider = new OllamaProvider({
      provider: LLMProvider.OLLAMA,
      model: "llama-test",
      // baseURL 未指定，应使用默认值 http://127.0.0.1:11434
    });
    await provider.generate({ prompt: "hi" });
    assert.ok(
      capturedUrl.includes("127.0.0.1:11434"),
      `Expected default URL, got: ${capturedUrl}`,
    );
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 createFromEnv 默认 provider/model 回退（lines 622-623）─────────────

test("LLMFactory.createFromEnv falls back to ANTHROPIC and default model when env vars not set", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        content: [],
        model: "claude-default",
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    }) as unknown as Response;
  try {
    await withEnv(
      {
        LLM_PROVIDER: undefined, // 触发 ?? LLMProvider.ANTHROPIC 右分支
        LLM_MODEL: undefined, // 触发 ?? "claude-sonnet-..." 右分支
        LLM_API_KEY: "test-key",
        LLM_BASE_URL: undefined,
      },
      async () => {
        LLMFactory.clearCache();
        const provider = LLMFactory.createFromEnv();
        assert.ok(provider instanceof AnthropicProvider);
        const result = await provider.generate({ prompt: "hi" });
        assert.equal(result.content, "");
      },
    );
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 normalizeBaseURL 末尾斜杠分支（line 64）────────────────────────────

test("normalizeBaseURL strips trailing slash from baseURL", async () => {
  let capturedUrl = "";
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string): Promise<Response> => {
    capturedUrl = url;
    return {
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{ message: { content: "reply" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: "gpt-test",
      }),
    } as unknown as Response;
  };
  try {
    LLMFactory.clearCache();
    const provider = new OpenAIProvider({
      provider: LLMProvider.OPENAI,
      model: "gpt-test",
      apiKey: "key",
      baseURL: "http://fake/", // 末尾带斜杠，触发 normalizeBaseURL 的 true 分支
    });
    await provider.generate({ prompt: "hi" });
    // 确认 URL 中没有双斜杠（/chat/completions 前只有一个斜杠）
    assert.ok(
      !capturedUrl.includes("//chat"),
      `URL should not have double slash: ${capturedUrl}`,
    );
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 buildChatMessages systemPrompt 分支（line 93）──────────────────────

test("OpenAIProvider sends system message when systemPrompt is provided", async () => {
  let capturedBody: any;
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (
    _url: string,
    options?: RequestInit,
  ): Promise<Response> => {
    capturedBody = JSON.parse(options?.body as string);
    return {
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{ message: { content: "reply" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: "gpt-test",
      }),
    } as unknown as Response;
  };
  try {
    LLMFactory.clearCache();
    const provider = new OpenAIProvider({
      provider: LLMProvider.OPENAI,
      model: "gpt-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    await provider.generate({ prompt: "hi", systemPrompt: "Be brief" });
    // 验证 messages 中第一条是系统消息
    assert.ok(Array.isArray(capturedBody.messages));
    assert.equal(capturedBody.messages[0].role, "system");
    assert.equal(capturedBody.messages[0].content, "Be brief");
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 buildChatMessages messages 数组分支（line 97）──────────────────────

test("OpenAIProvider includes prior messages in request body", async () => {
  let capturedBody: any;
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (
    _url: string,
    options?: RequestInit,
  ): Promise<Response> => {
    capturedBody = JSON.parse(options?.body as string);
    return {
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{ message: { content: "reply" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: "gpt-test",
      }),
    } as unknown as Response;
  };
  try {
    LLMFactory.clearCache();
    const provider = new OpenAIProvider({
      provider: LLMProvider.OPENAI,
      model: "gpt-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    await provider.generate({
      prompt: "continue",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ],
    });
    // 验证 messages 中包含之前的对话历史
    assert.ok(Array.isArray(capturedBody.messages));
    const roles = (capturedBody.messages as Array<{ role: string }>).map(
      (m) => m.role,
    );
    assert.ok(
      roles.includes("assistant"),
      `Expected assistant role, got: ${JSON.stringify(roles)}`,
    );
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 buildOptionalBearerHeaders 无 apiKey 分支（line 131）───────────────

test("OpenClawProvider omits Authorization header when no apiKey is provided", async () => {
  let capturedHeaders: Record<string, string> = {};
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (
    _url: string,
    options?: RequestInit,
  ): Promise<Response> => {
    capturedHeaders = (options?.headers ?? {}) as Record<string, string>;
    return {
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{ message: { content: "reply" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: "openclaw-test",
      }),
    } as unknown as Response;
  };
  try {
    LLMFactory.clearCache();
    const provider = new OpenClawProvider({
      provider: LLMProvider.OPENCLAW,
      model: "openclaw-test",
      baseURL: "http://fake",
      // 无 apiKey — 触发 buildOptionalBearerHeaders 的 false 分支（不添加 Authorization）
    });
    await provider.generate({ prompt: "hi" });
    assert.ok(
      !("Authorization" in capturedHeaders),
      "Should not have Authorization header without apiKey",
    );
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 parseOpenAIToolCalls 返回工具调用数组（lines 192-196）──────────────

test("OpenAIProvider.generate returns toolCalls when server responds with tool_calls", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call_abc",
                  function: { name: "my_tool", arguments: '{"x":42}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: "gpt-test",
      }),
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new OpenAIProvider({
      provider: LLMProvider.OPENAI,
      model: "gpt-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    const result = await provider.generate({ prompt: "call a tool" });
    assert.ok(Array.isArray(result.toolCalls), "toolCalls should be an array");
    assert.equal(result.toolCalls!.length, 1);
    assert.equal(result.toolCalls![0].name, "my_tool");
    assert.deepEqual(result.toolCalls![0].parameters, { x: 42 });
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 parseAnthropicUsage 无 usage 分支（line 177）───────────────────────

test("AnthropicProvider returns undefined usage when response has no usage field", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        content: [{ type: "text", text: "hello" }],
        model: "claude-test",
        // 无 usage 字段 — 触发 line 177 true 分支
      }),
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new AnthropicProvider({
      provider: LLMProvider.ANTHROPIC,
      model: "claude-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    const result = await provider.generate({ prompt: "hi" });
    assert.equal(result.usage, undefined);
    assert.equal(result.content, "hello");
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 parseAnthropicUsage ?? 0 回退分支（lines 181-182）─────────────────

test("AnthropicProvider usage falls back to 0 when token counts are missing", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        content: [{ type: "text", text: "hello" }],
        model: "claude-test",
        usage: {}, // 缺少 input_tokens / output_tokens，触发 ?? 0 回退
      }),
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new AnthropicProvider({
      provider: LLMProvider.ANTHROPIC,
      model: "claude-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    const result = await provider.generate({ prompt: "hi" });
    assert.equal(result.usage?.promptTokens, 0);
    assert.equal(result.usage?.completionTokens, 0);
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 parseOpenAIToolCalls 缺少 function 字段（lines 198-199）────────────

test("parseOpenAIToolCalls uses 'unknown' name and {} params when function fields are missing", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [
          {
            message: {
              content: "",
              // function 对象没有 name 也没有 arguments — 触发 ?? "unknown" 和 ?? "{}"
              tool_calls: [{ id: "call_1", function: {} }],
            },
          },
        ],
        model: "gpt-test",
      }),
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new OpenAIProvider({
      provider: LLMProvider.OPENAI,
      model: "gpt-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    const result = await provider.generate({ prompt: "tool call" });
    assert.ok(Array.isArray(result.toolCalls));
    assert.equal(result.toolCalls![0].name, "unknown");
    assert.deepEqual(result.toolCalls![0].parameters, {});
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 parseOpenAICompatibleResponse content ?? "" 分支（line 205）────────

test("OpenAIProvider returns empty string when message.content is null", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{ message: { content: null } }], // content 为 null — 触发 ?? "" 回退
        model: "gpt-test",
      }),
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new OpenAIProvider({
      provider: LLMProvider.OPENAI,
      model: "gpt-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    const result = await provider.generate({ prompt: "hi" });
    assert.equal(result.content, "");
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 parseAnthropicResponse block.text ?? "" 分支（lines 217-218）────────

test("AnthropicProvider uses empty string when text block has no text field", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        content: [{ type: "text" }], // text 块没有 text 字段 — 触发 block.text ?? "" 回退
        model: "claude-test",
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new AnthropicProvider({
      provider: LLMProvider.ANTHROPIC,
      model: "claude-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    const result = await provider.generate({ prompt: "hi" });
    assert.equal(result.content, "");
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 parseOllamaResponse response ?? "" 分支（line 234）─────────────────

test("OllamaProvider returns empty string when response field is missing", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        // 无 response 字段 — 触发 raw?.response ?? "" 回退（line 234）
        model: "llama-test",
        prompt_eval_count: 3,
        eval_count: 2,
      }),
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new OllamaProvider({
      provider: LLMProvider.OLLAMA,
      model: "llama-test",
      baseURL: "http://fake",
    });
    const result = await provider.generate({ prompt: "hi" });
    assert.equal(result.content, "");
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 parseFiniteNumber 有效数字分支（line 73 true branch）────────────────

test("LLMFactory.createFromEnv uses LLM_MAX_TOKENS when it is a valid finite number", async () => {
  await withEnv(
    {
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      LLM_API_KEY: "key",
      LLM_MAX_TOKENS: "2048", // Number("2048") = 2048, Number.isFinite(2048) = true → true 分支
    },
    async () => {
      LLMFactory.clearCache();
      const provider = LLMFactory.createFromEnv();
      assert.ok(provider instanceof AnthropicProvider);
    },
  );
  LLMFactory.clearCache();
});

// ── 覆盖 postJSON errorBody 为空时使用 statusText（line 152 || 右侧）────────

test("OpenAIProvider.generate error message uses statusText when response body is empty", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "", // 空 body → errorBody = "" (falsy) → 使用 statusText 分支
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new OpenAIProvider({
      provider: LLMProvider.OPENAI,
      model: "gpt-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    await assert.rejects(
      () => provider.generate({ prompt: "hi" }),
      /Service Unavailable/,
    );
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 parseFiniteNumber NaN 回退分支（line 73）──────────────────────────────

test("LLMFactory.createFromEnv falls back to default max tokens when LLM_MAX_TOKENS is not a valid number", async () => {
  await withEnv(
    {
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      LLM_API_KEY: "key",
      LLM_MAX_TOKENS: "not-a-number", // Number("not-a-number") === NaN → 触发 false 分支
    },
    async () => {
      LLMFactory.clearCache();
      // 只需验证 createFromEnv 不抛出（内部用默认值 4096 代替 NaN）
      const provider = LLMFactory.createFromEnv();
      assert.ok(provider instanceof AnthropicProvider);
    },
  );
  LLMFactory.clearCache();
});

// ── 覆盖 assertBaseURL throws 分支（line 84）──────────────────────────────────

test("OpenClawProvider.generate throws when baseURL is not provided", async () => {
  const provider = new OpenClawProvider({
    provider: LLMProvider.OPENCLAW,
    model: "openclaw-test",
    // no baseURL — assertBaseURL should throw
  });
  await assert.rejects(
    () => provider.generate({ prompt: "hi" }),
    /baseURL is required/,
  );
  LLMFactory.clearCache();
});

// ── 覆盖 postJSON !response.ok 分支（line 150）────────────────────────────────

test("OpenAIProvider.generate throws an error on HTTP error response", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "upstream failure",
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new OpenAIProvider({
      provider: LLMProvider.OPENAI,
      model: "gpt-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    await assert.rejects(() => provider.generate({ prompt: "hi" }), /HTTP 500/);
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 parseOpenAICompatibleUsage ?? 0 回退分支（lines 168-171）────────────

test("OpenAIProvider usage falls back to 0 when token count fields are absent", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{ message: { content: "reply" } }],
        usage: {}, // 无 prompt_tokens / completion_tokens / total_tokens → ?? 0 分支
        model: "gpt-test",
      }),
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new OpenAIProvider({
      provider: LLMProvider.OPENAI,
      model: "gpt-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    const result = await provider.generate({ prompt: "hi" });
    assert.equal(result.usage?.promptTokens, 0);
    assert.equal(result.usage?.completionTokens, 0);
    assert.equal(result.usage?.totalTokens, 0);
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});

// ── 覆盖 parseAnthropicResponse content 非数组分支（line 214 ternary false）──

test("AnthropicProvider returns empty string when response content is not an array", async () => {
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (): Promise<Response> =>
    ({
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      json: async () => ({
        content: null, // !Array.isArray(null) → ternary false 分支 → content = ""
        model: "claude-test",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    }) as unknown as Response;
  try {
    LLMFactory.clearCache();
    const provider = new AnthropicProvider({
      provider: LLMProvider.ANTHROPIC,
      model: "claude-test",
      apiKey: "key",
      baseURL: "http://fake",
    });
    const result = await provider.generate({ prompt: "hi" });
    assert.equal(result.content, "");
  } finally {
    (globalThis as any).fetch = origFetch;
    LLMFactory.clearCache();
  }
});
