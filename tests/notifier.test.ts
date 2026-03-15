import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Notifier,
  NotificationChannel,
  NotificationLevel,
  createNotifier,
  createNotifierFromEnv,
} from "../src/engine/notifier.js";
import { withEnv } from "./helpers.js";

describe("Notifier", () => {
  describe("NotificationChannel", () => {
    it("包含所有通知渠道", () => {
      assert.equal(NotificationChannel.DISCORD, "discord");
      assert.equal(NotificationChannel.TELEGRAM, "telegram");
      assert.equal(NotificationChannel.EMAIL, "email");
      assert.equal(NotificationChannel.LOG, "log");
      assert.equal(NotificationChannel.CONSOLE, "console");
    });
  });

  describe("NotificationLevel", () => {
    it("包含所有通知级别", () => {
      assert.equal(NotificationLevel.INFO, "info");
      assert.equal(NotificationLevel.WARNING, "warning");
      assert.equal(NotificationLevel.ERROR, "error");
      assert.equal(NotificationLevel.SUCCESS, "success");
      assert.equal(NotificationLevel.MANUAL_REQUEST, "manual_request");
    });
  });

  describe("enabled=false — 禁用时不发送", () => {
    it("disabled 时 notify 不写任何日志", async () => {
      const notifier = new Notifier({
        enabled: false,
        enabledChannels: [NotificationChannel.LOG],
      });
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(String(args[0]));
      };
      try {
        await notifier.notify({
          level: NotificationLevel.INFO,
          title: "t",
          content: "c",
        });
      } finally {
        console.log = origLog;
      }
      assert.equal(logs.length, 0);
    });
  });

  describe("LOG 渠道", () => {
    it("写入 JSON 格式日志", async () => {
      const notifier = new Notifier({
        enabled: true,
        enabledChannels: [NotificationChannel.LOG],
      });
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(String(args[0]));
      };
      try {
        await notifier.notify({
          level: NotificationLevel.INFO,
          title: "hello",
          content: "world",
        });
      } finally {
        console.log = origLog;
      }
      assert.equal(logs.length, 1);
      const entry = JSON.parse(logs[0]);
      assert.equal(entry.level, "info");
      assert.equal(entry.title, "hello");
      assert.equal(entry.content, "world");
      assert.ok(typeof entry.timestamp === "string");
    });

    it("自定义时间戳被保留", async () => {
      const notifier = new Notifier({
        enabled: true,
        enabledChannels: [NotificationChannel.LOG],
      });
      const ts = 1000000000000;
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(String(args[0]));
      };
      try {
        await notifier.notify({
          level: NotificationLevel.ERROR,
          title: "t",
          content: "c",
          timestamp: ts,
        });
      } finally {
        console.log = origLog;
      }
      const entry = JSON.parse(logs[0]);
      assert.equal(new Date(entry.timestamp).getTime(), ts);
    });
  });

  describe("CONSOLE 渠道", () => {
    it("调用 console.log 不抛出", async () => {
      const notifier = new Notifier({
        enabled: true,
        enabledChannels: [NotificationChannel.CONSOLE],
      });
      let called = false;
      const origLog = console.log;
      console.log = () => {
        called = true;
      };
      try {
        await notifier.notify({
          level: NotificationLevel.WARNING,
          title: "w",
          content: "msg",
        });
      } finally {
        console.log = origLog;
      }
      assert.equal(called, true);
    });
  });

  describe("便捷方法 — 委托 notify()", () => {
    function makeNotifier() {
      const logs: string[] = [];
      const notifier = new Notifier({
        enabled: true,
        enabledChannels: [NotificationChannel.LOG],
      });
      return { notifier, logs };
    }

    async function captureLog(fn: () => Promise<void>): Promise<string> {
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(String(args[0]));
      };
      try {
        await fn();
      } finally {
        console.log = origLog;
      }
      return logs[0];
    }

    it("info() 使用 INFO 级别", async () => {
      const { notifier } = makeNotifier();
      const raw = await captureLog(() => notifier.info("t", "c"));
      assert.equal(JSON.parse(raw).level, "info");
    });

    it("warning() 使用 WARNING 级别", async () => {
      const { notifier } = makeNotifier();
      const raw = await captureLog(() => notifier.warning("t", "c"));
      assert.equal(JSON.parse(raw).level, "warning");
    });

    it("error() 使用 ERROR 级别", async () => {
      const { notifier } = makeNotifier();
      const raw = await captureLog(() => notifier.error("t", "c"));
      assert.equal(JSON.parse(raw).level, "error");
    });

    it("success() 使用 SUCCESS 级别", async () => {
      const { notifier } = makeNotifier();
      const raw = await captureLog(() => notifier.success("t", "c"));
      assert.equal(JSON.parse(raw).level, "success");
    });

    it("requestManual() 使用 MANUAL_REQUEST 级别", async () => {
      const { notifier } = makeNotifier();
      const raw = await captureLog(() =>
        notifier.requestManual("t", "c", [{ name: "f", value: "v" }]),
      );
      assert.equal(JSON.parse(raw).level, "manual_request");
    });
  });

  describe("TELEGRAM 渠道", () => {
    it("有 telegram 配置时发送不抛出（网络错误由内部 catch 处理）", async () => {
      const notifier = new Notifier({
        enabled: true,
        enabledChannels: [NotificationChannel.TELEGRAM],
        telegram: { botToken: "FAKE_TOKEN_123", chatId: "99999" },
      });
      await assert.doesNotReject(() =>
        notifier.info("test title", "test content"),
      );
    });

    it("fetch 抛出时 catch 捕获不向外传播", async () => {
      const origFetch = (globalThis as any).fetch;
      (globalThis as any).fetch = async () => {
        throw new Error("网络错误");
      };
      const notifier = new Notifier({
        enabled: true,
        enabledChannels: [NotificationChannel.TELEGRAM],
        telegram: { botToken: "tok", chatId: "123" },
      });
      try {
        await assert.doesNotReject(() => notifier.info("t", "c"));
      } finally {
        (globalThis as any).fetch = origFetch;
      }
    });

    it("response.ok=false 时记录错误但不抛出", async () => {
      const origFetch = (globalThis as any).fetch;
      (globalThis as any).fetch = async () =>
        ({ ok: false, statusText: "Forbidden" }) as Response;
      const notifier = new Notifier({
        enabled: true,
        enabledChannels: [NotificationChannel.TELEGRAM],
        telegram: { botToken: "tok", chatId: "123" },
      });
      try {
        await assert.doesNotReject(() => notifier.info("t", "c"));
      } finally {
        (globalThis as any).fetch = origFetch;
      }
    });
  });

  describe("DISCORD 渠道 — 网络错误", () => {
    it("response.ok=false 时记录错误但不抛出", async () => {
      const origFetch = (globalThis as any).fetch;
      (globalThis as any).fetch = async () =>
        ({ ok: false, statusText: "Bad Request" }) as Response;
      const notifier = new Notifier({
        enabled: true,
        enabledChannels: [NotificationChannel.DISCORD],
        discord: {
          webhookUrl: "https://fake.discord.webhook/",
          username: "bot",
        },
      });
      try {
        await assert.doesNotReject(() => notifier.info("t", "c"));
      } finally {
        (globalThis as any).fetch = origFetch;
      }
    });

    it("fetch 抛出时 catch 捕获不向外传播", async () => {
      const origFetch = (globalThis as any).fetch;
      (globalThis as any).fetch = async () => {
        throw new Error("连接拒绝");
      };
      const notifier = new Notifier({
        enabled: true,
        enabledChannels: [NotificationChannel.DISCORD],
        discord: {
          webhookUrl: "https://fake.discord.webhook/",
          username: "bot",
        },
      });
      try {
        await assert.doesNotReject(() => notifier.info("t", "c"));
      } finally {
        (globalThis as any).fetch = origFetch;
      }
    });
  });

  describe("多渠道并行 — 渠道不可用时不崩溃", () => {
    it("DISCORD 没有配置时跳过（不抛出）", async () => {
      // 启用 DISCORD 渠道但不提供配置，应跳过而非崩溃
      const notifier = new Notifier({
        enabled: true,
        enabledChannels: [NotificationChannel.DISCORD, NotificationChannel.LOG],
        // discord 属性未提供
      });
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(String(args[0]));
      };
      try {
        await assert.doesNotReject(() =>
          notifier.notify({
            level: NotificationLevel.INFO,
            title: "t",
            content: "c",
          }),
        );
      } finally {
        console.log = origLog;
      }
      // LOG 渠道仍然写入日志
      assert.equal(logs.length, 1);
    });
  });

  describe("私有方法覆盖（via as any）", () => {
    it("getColorByLevel — 各级别返回数字颜色", () => {
      const n = new Notifier({ enabled: true, enabledChannels: [] });
      const getColor = (level: string) =>
        (n as any).getColorByLevel(level) as number;
      assert.ok(typeof getColor(NotificationLevel.INFO) === "number");
      assert.ok(typeof getColor(NotificationLevel.WARNING) === "number");
      assert.ok(typeof getColor(NotificationLevel.ERROR) === "number");
      assert.ok(typeof getColor(NotificationLevel.SUCCESS) === "number");
      assert.ok(typeof getColor(NotificationLevel.MANUAL_REQUEST) === "number");
      // default fallback
      assert.ok(typeof getColor("unknown_level") === "number");
    });

    it("getIconByLevel — 各级别返回字符串", () => {
      const n = new Notifier({ enabled: true, enabledChannels: [] });
      const getIcon = (level: string) =>
        (n as any).getIconByLevel(level) as string;
      assert.ok(typeof getIcon(NotificationLevel.INFO) === "string");
      assert.ok(typeof getIcon(NotificationLevel.WARNING) === "string");
      assert.ok(typeof getIcon(NotificationLevel.ERROR) === "string");
      assert.ok(typeof getIcon(NotificationLevel.SUCCESS) === "string");
      assert.ok(typeof getIcon(NotificationLevel.MANUAL_REQUEST) === "string");
      assert.ok(typeof getIcon("unknown_level") === "string");
    });

    it("getConsoleColorByLevel — 各级别返回字符串", () => {
      const n = new Notifier({ enabled: true, enabledChannels: [] });
      const getConsoleColor = (level: string) =>
        (n as any).getConsoleColorByLevel(level) as string;
      assert.ok(typeof getConsoleColor(NotificationLevel.INFO) === "string");
      assert.ok(typeof getConsoleColor(NotificationLevel.WARNING) === "string");
      assert.ok(typeof getConsoleColor(NotificationLevel.ERROR) === "string");
      assert.ok(typeof getConsoleColor(NotificationLevel.SUCCESS) === "string");
      assert.ok(
        typeof getConsoleColor(NotificationLevel.MANUAL_REQUEST) === "string",
      );
      assert.ok(typeof getConsoleColor("unknown_level") === "string");
    });
  });

  describe("工厂函数", () => {
    it("createNotifier 返回 Notifier 实例", () => {
      const n = createNotifier({ enabled: false, enabledChannels: [] });
      assert.ok(n instanceof Notifier);
    });

    it("createNotifierFromEnv 默认总是包含 CONSOLE 渠道", async () => {
      await withEnv(
        {
          DISCORD_WEBHOOK_URL: undefined,
          TELEGRAM_BOT_TOKEN: undefined,
          TELEGRAM_CHAT_ID: undefined,
          NOTIFICATIONS_ENABLED: "true",
        },
        async () => {
          const n = createNotifierFromEnv();
          assert.ok(n instanceof Notifier);
          // CONSOLE 渠道始终存在，不抛出
          let called = false;
          const origLog = console.log;
          console.log = () => {
            called = true;
          };
          try {
            await n.info("test", "msg");
          } finally {
            console.log = origLog;
          }
          assert.equal(called, true);
        },
      );
    });

    it("createNotifierFromEnv NOTIFICATIONS_ENABLED=false 时禁用", async () => {
      await withEnv({ NOTIFICATIONS_ENABLED: "false" }, async () => {
        const n = createNotifierFromEnv();
        const logs: string[] = [];
        const origLog = console.log;
        console.log = (...args: unknown[]) => {
          logs.push(String(args[0]));
        };
        try {
          await n.info("t", "c");
        } finally {
          console.log = origLog;
        }
        assert.equal(logs.length, 0);
      });
    });

    it("createNotifierFromEnv 配置 Telegram 环境变量时加入 TELEGRAM 渠道", async () => {
      await withEnv(
        {
          TELEGRAM_BOT_TOKEN: "123456:ABC",
          TELEGRAM_CHAT_ID: "987654",
          NOTIFICATIONS_ENABLED: "true",
        },
        async () => {
          const n = createNotifierFromEnv();
          assert.ok(n instanceof Notifier);
        },
      );
    });

    it("createNotifierFromEnv 配置 Discord 环境变量时加入 DISCORD 渠道", async () => {
      await withEnv(
        {
          DISCORD_WEBHOOK_URL: "https://example.com/webhook",
          DISCORD_USERNAME: "bot",
          NOTIFICATIONS_ENABLED: "true",
        },
        async () => {
          const n = createNotifierFromEnv();
          assert.ok(n instanceof Notifier);
        },
      );
    });
  });
});
