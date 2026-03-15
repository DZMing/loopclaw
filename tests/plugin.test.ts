import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import registerPlugin from "../src/plugin.js";
import {
  createMockApi,
  createLogger,
  eventually,
  withTempWorkspace,
} from "./helpers.js";

test("gateway_start auto_start_engine should start the running loop", async () => {
  await withTempWorkspace(
    "lobster-plugin-autostart",
    async ({ workspaceDir, stateDir }) => {
      await fs.writeFile(
        path.join(workspaceDir, "MISSION_PARTNER.md"),
        "# MISSION\n\n## 核心目标\n自动启动验证\n\n## 具体任务\n1. 检查配置\n",
        "utf-8",
      );

      const api = createMockApi({
        auto_start_engine: true,
        reportInterval: 1,
        enableHealthCheck: false,
      });

      registerPlugin(api);

      const gatewayStartHooks = api.artifacts.hooks.get("gateway_start") ?? [];
      assert.equal(gatewayStartHooks.length > 0, true);

      for (const hook of gatewayStartHooks) {
        await hook(
          {},
          {
            config: api.config,
            workspaceDir,
            stateDir,
            logger: createLogger(),
          },
        );
      }

      const isRunning = api.artifacts.rpcMethods.get("lobster.isRunning");
      assert.ok(isRunning);

      await eventually(
        async () => {
          assert.equal(await isRunning!(), true);
        },
        { timeoutMs: 2000, intervalMs: 50 },
      );

      const stop = api.artifacts.rpcMethods.get("lobster.stop");
      assert.ok(stop);
      await stop!();
    },
  );
});

test("gateway_start should accept string auto_start_engine values from OpenClaw config", async () => {
  await withTempWorkspace(
    "lobster-plugin-autostart-string",
    async ({ workspaceDir, stateDir }) => {
      await fs.writeFile(
        path.join(workspaceDir, "MISSION_PARTNER.md"),
        "# MISSION\n\n## 核心目标\n字符串自动启动验证\n\n## 具体任务\n1. 检查配置\n",
        "utf-8",
      );

      const api = createMockApi({
        auto_start_engine: "true",
        reportInterval: 1,
        enableHealthCheck: false,
      });

      registerPlugin(api);

      const gatewayStartHooks = api.artifacts.hooks.get("gateway_start") ?? [];
      assert.equal(gatewayStartHooks.length > 0, true);

      for (const hook of gatewayStartHooks) {
        await hook(
          {},
          {
            config: api.config,
            workspaceDir,
            stateDir,
            logger: createLogger(),
          },
        );
      }

      const isRunning = api.artifacts.rpcMethods.get("lobster.isRunning");
      assert.ok(isRunning);

      await eventually(
        async () => {
          assert.equal(await isRunning!(), true);
        },
        { timeoutMs: 2000, intervalMs: 50 },
      );

      const stop = api.artifacts.rpcMethods.get("lobster.stop");
      assert.ok(stop);
      await stop!();
    },
  );
});

test("partner_analyze should return dynamic analyzer output instead of a hard-coded report", async () => {
  await withTempWorkspace(
    "lobster-plugin-analyze",
    async ({ workspaceDir, stateDir }) => {
      await fs.writeFile(
        path.join(workspaceDir, "sample.ts"),
        "export function add(a: number, b: number) { return a + b; }\n",
        "utf-8",
      );

      const api = createMockApi({ enableHealthCheck: false });
      registerPlugin(api);

      const service = api.artifacts.services.get("lobster-perpetual-engine");
      assert.ok(service);
      await service!.start({
        config: api.config,
        workspaceDir,
        stateDir,
        logger: createLogger(),
      });

      const analyze = api.artifacts.commands.get("partner_analyze");
      assert.ok(analyze);

      const response = await analyze!.handler({
        channel: "channel-2",
        commandBody: "",
        config: api.config,
        isAuthorizedSender: true,
      });

      assert.ok(response.text);
      assert.match(response.text, /代码质量分析/);
      assert.doesNotMatch(response.text, /评分: 48\/100/);
      assert.doesNotMatch(response.text, /问题: 13 个/);
    },
  );
});

test("partner_orchestrate and partner_orchestrators should not be registered", async () => {
  const api = createMockApi({ enableHealthCheck: false });
  registerPlugin(api);

  const orchestrate = api.artifacts.commands.get("partner_orchestrate");
  const list = api.artifacts.commands.get("partner_orchestrators");

  assert.equal(orchestrate, undefined);
  assert.equal(list, undefined);
});

test("lobster.start should return a structured error when runtime context is missing", async () => {
  const api = createMockApi({ enableHealthCheck: false });
  registerPlugin(api);

  const start = api.artifacts.rpcMethods.get("lobster.start");
  assert.ok(start);

  const result = await start!();
  assert.deepEqual(result, {
    success: false,
    error:
      "OpenClaw 宿主上下文缺失，请先通过服务启动或 gateway_start 注入 workspaceDir/stateDir",
  });
});
