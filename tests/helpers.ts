import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  OpenClawPluginApi,
  OpenClawPluginCommandDefinition,
  OpenClawPluginService,
  OpenClawPluginServiceContext,
  PluginHookName,
} from "../src/types.js";

export interface RegisteredPluginArtifacts {
  commands: Map<string, OpenClawPluginCommandDefinition>;
  services: Map<string, OpenClawPluginService>;
  hooks: Map<
    PluginHookName,
    Array<
      (
        event: unknown,
        ctx: OpenClawPluginServiceContext,
      ) => unknown | Promise<unknown>
    >
  >;
  rpcMethods: Map<string, (...args: unknown[]) => unknown | Promise<unknown>>;
  httpRoutes: Array<unknown>;
}

export function createLogger() {
  return {
    debug: (_message: string) => {},
    info: (_message: string) => {},
    warn: (_message: string) => {},
    error: (_message: string) => {},
  };
}

export function createMockApi(
  config: Record<string, unknown> = {},
): OpenClawPluginApi & { artifacts: RegisteredPluginArtifacts } {
  const artifacts: RegisteredPluginArtifacts = {
    commands: new Map(),
    services: new Map(),
    hooks: new Map(),
    rpcMethods: new Map(),
    httpRoutes: [],
  };

  const logger = createLogger();

  return {
    id: "lobster-test-plugin",
    name: "lobster-test-plugin",
    source: "test",
    config,
    runtime: {},
    logger,
    registerService(service) {
      artifacts.services.set(service.id, service);
    },
    registerCommand(command) {
      artifacts.commands.set(command.name, command);
    },
    registerHttpRoute(route) {
      artifacts.httpRoutes.push(route);
    },
    registerGatewayMethod(method) {
      artifacts.rpcMethods.set(method.name, method.handler);
    },
    on(hookName, handler) {
      const handlers = artifacts.hooks.get(hookName) ?? [];
      handlers.push(
        handler as (
          event: unknown,
          ctx: OpenClawPluginServiceContext,
        ) => unknown | Promise<unknown>,
      );
      artifacts.hooks.set(hookName, handlers);
    },
    artifacts,
  };
}

export async function createTempWorkspace(prefix: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  const workspaceDir = path.join(root, "workspace");
  const stateDir = path.join(root, "state");

  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(stateDir, { recursive: true });

  return {
    root,
    workspaceDir,
    stateDir,
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

export async function withTempWorkspace<T>(
  prefix: string,
  fn: (dirs: Awaited<ReturnType<typeof createTempWorkspace>>) => Promise<T>,
): Promise<T> {
  const dirs = await createTempWorkspace(prefix);
  try {
    return await fn(dirs);
  } finally {
    await dirs.cleanup();
  }
}

export async function withEnv<T>(
  values: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export async function eventually(
  assertion: () => Promise<void> | void,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const intervalMs = options.intervalMs ?? 25;
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new assert.AssertionError({
        message: "condition was not met before timeout",
      });
}
