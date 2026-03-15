/**
 * 📢 通知系统
 *
 * 支持多种通知渠道：
 * - Discord Webhook
 * - Telegram Bot
 * - Email (可选)
 * - 系统日志
 *
 * @version 2.40.0
 * @since 2025-03-11
 */

// ========== 类型定义 ==========

/**
 * 通知渠道
 */
export enum NotificationChannel {
  /** Discord */
  DISCORD = "discord",
  /** Telegram */
  TELEGRAM = "telegram",
  /** Email */
  EMAIL = "email",
  /** 系统日志 */
  LOG = "log",
  /** 控制台 */
  CONSOLE = "console",
}

/**
 * 通知级别
 */
export enum NotificationLevel {
  /** 信息 */
  INFO = "info",
  /** 警告 */
  WARNING = "warning",
  /** 错误 */
  ERROR = "error",
  /** 成功 */
  SUCCESS = "success",
  /** 人工介入请求 */
  MANUAL_REQUEST = "manual_request",
}

/**
 * 通知消息
 */
export interface NotificationMessage {
  /** 级别 */
  level: NotificationLevel;
  /** 标题 */
  title: string;
  /** 内容 */
  content: string;
  /** 字段 */
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  /** 时间戳 */
  timestamp?: number;
  /** 颜色（Discord） */
  color?: number;
}

/**
 * Discord 配置
 */
export interface DiscordConfig {
  /** Webhook URL */
  webhookUrl: string;
  /** 用户名 */
  username?: string;
  /** 头像 */
  avatarUrl?: string;
}

/**
 * Telegram 配置
 */
export interface TelegramConfig {
  /** Bot Token */
  botToken: string;
  /** 聊天 ID */
  chatId: string;
  /** API 端点 */
  apiBaseUrl?: string;
}

/**
 * 通知器配置
 */
export interface NotifierConfig {
  /** Discord 配置 */
  discord?: DiscordConfig;
  /** Telegram 配置 */
  telegram?: TelegramConfig;
  /** 启用的渠道 */
  enabledChannels: NotificationChannel[];
  /** 是否启用 */
  enabled: boolean;
}

// ========== 通知器 ==========

/**
 * 多渠道通知器
 */
export class Notifier {
  private config: NotifierConfig;

  constructor(config: NotifierConfig) {
    this.config = config;
  }

  /**
   * 发送通知
   */
  async notify(message: NotificationMessage): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const enrichedMessage = {
      ...message,
      timestamp: message.timestamp ?? Date.now(),
    };

    // 根据级别设置颜色
    if (!message.color) {
      enrichedMessage.color = this.getColorByLevel(message.level);
    }

    // 并行发送到所有启用的渠道
    const promises: Promise<void>[] = [];

    for (const channel of this.config.enabledChannels) {
      switch (channel) {
        case NotificationChannel.DISCORD:
          if (this.config.discord) {
            promises.push(this.sendToDiscord(enrichedMessage));
          }
          break;
        case NotificationChannel.TELEGRAM:
          if (this.config.telegram) {
            promises.push(this.sendToTelegram(enrichedMessage));
          }
          break;
        case NotificationChannel.LOG:
          this.sendToLog(enrichedMessage);
          break;
        case NotificationChannel.CONSOLE:
          this.sendToConsole(enrichedMessage);
          break;
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * 快速发送信息
   */
  async info(title: string, content: string): Promise<void> {
    return this.notify({ level: NotificationLevel.INFO, title, content });
  }

  /**
   * 快速发送警告
   */
  async warning(title: string, content: string): Promise<void> {
    return this.notify({ level: NotificationLevel.WARNING, title, content });
  }

  /**
   * 快速发送错误
   */
  async error(title: string, content: string): Promise<void> {
    return this.notify({ level: NotificationLevel.ERROR, title, content });
  }

  /**
   * 快速发送成功
   */
  async success(title: string, content: string): Promise<void> {
    return this.notify({ level: NotificationLevel.SUCCESS, title, content });
  }

  /**
   * 请求人工介入
   */
  async requestManual(
    title: string,
    content: string,
    fields?: Array<{ name: string; value: string }>,
  ): Promise<void> {
    return this.notify({
      level: NotificationLevel.MANUAL_REQUEST,
      title,
      content,
      fields,
      color: 15105546, // 红色
    });
  }

  // ========== 私有方法 ==========

  /**
   * 发送到 Discord
   */
  private async sendToDiscord(message: NotificationMessage): Promise<void> {
    const webhookUrl = this.config.discord!.webhookUrl;
    const discordConfig = this.config.discord!;

    const payload = {
      username: discordConfig.username ?? "龙虾自动驾使",
      avatar_url: discordConfig.avatarUrl,
      embeds: [
        {
          title: message.title,
          description: message.content,
          color: message.color,
          fields: message.fields,
          timestamp: new Date(message.timestamp ?? Date.now()).toISOString(),
        },
      ],
    };

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`Discord 通知失败: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Discord 通知错误: ${error}`);
    }
  }

  /**
   * 发送到 Telegram
   */
  private async sendToTelegram(message: NotificationMessage): Promise<void> {
    const telegramConfig = this.config.telegram!;
    const {
      botToken,
      chatId,
      apiBaseUrl = "https://api.telegram.org",
    } = telegramConfig;

    const icon = this.getIconByLevel(message.level);
    const text = `${icon} **${message.title}**\n\n${message.content}`;

    try {
      const response = await fetch(`${apiBaseUrl}/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
        }),
      });

      if (!response.ok) {
        console.error(`Telegram 通知失败: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Telegram 通知错误: ${error}`);
    }
  }

  /**
   * 发送到日志
   */
  private sendToLog(message: NotificationMessage): void {
    const logEntry = {
      timestamp: new Date(message.timestamp ?? Date.now()).toISOString(),
      level: message.level,
      title: message.title,
      content: message.content,
    };
    console.log(JSON.stringify(logEntry));
  }

  /**
   * 发送到控制台
   */
  private sendToConsole(message: NotificationMessage): void {
    const icon = this.getIconByLevel(message.level);
    const color = this.getConsoleColorByLevel(message.level);
    console.log(
      `%c${icon} [${message.level.toUpperCase()}] ${message.title}\n${message.content}`,
      `color: ${color}; font-weight: bold`,
    );
  }

  /**
   * 根据级别获取颜色
   */
  private getColorByLevel(level: NotificationLevel): number {
    switch (level) {
      case NotificationLevel.INFO:
        return 3447003; // 蓝色
      case NotificationLevel.WARNING:
        return 15105546; // 橙色
      case NotificationLevel.ERROR:
        return 15158332; // 红色
      case NotificationLevel.SUCCESS:
        return 3066993; // 绿色
      case NotificationLevel.MANUAL_REQUEST:
        return 15105546; // 红色
      default:
        return 0;
    }
  }

  /**
   * 根据级别获取图标
   */
  private getIconByLevel(level: NotificationLevel): string {
    switch (level) {
      case NotificationLevel.INFO:
        return "ℹ️";
      case NotificationLevel.WARNING:
        return "⚠️";
      case NotificationLevel.ERROR:
        return "❌";
      case NotificationLevel.SUCCESS:
        return "✅";
      case NotificationLevel.MANUAL_REQUEST:
        return "🤚";
      default:
        return "📋";
    }
  }

  /**
   * 获取控制台颜色
   */
  private getConsoleColorByLevel(level: NotificationLevel): string {
    switch (level) {
      case NotificationLevel.INFO:
        return "#3498db";
      case NotificationLevel.WARNING:
        return "#f39c12";
      case NotificationLevel.ERROR:
        return "#e74c3c";
      case NotificationLevel.SUCCESS:
        return "#2ecc71";
      case NotificationLevel.MANUAL_REQUEST:
        return "#e67e22";
      default:
        return "#95a5a6";
    }
  }
}

// ========== 工厂函数 ==========

/**
 * 创建通知器
 */
export function createNotifier(config: NotifierConfig): Notifier {
  return new Notifier(config);
}

/**
 * 从环境变量创建通知器
 */
export function createNotifierFromEnv(): Notifier {
  const config: NotifierConfig = {
    enabled: process.env.NOTIFICATIONS_ENABLED !== "false",
    enabledChannels: [],
  };

  // Discord 配置
  if (process.env.DISCORD_WEBHOOK_URL) {
    config.discord = {
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      username: process.env.DISCORD_USERNAME,
    };
    config.enabledChannels.push(NotificationChannel.DISCORD);
  }

  // Telegram 配置
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    config.telegram = {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    };
    config.enabledChannels.push(NotificationChannel.TELEGRAM);
  }

  // 总是启用控制台
  config.enabledChannels.push(NotificationChannel.CONSOLE);

  return new Notifier(config);
}
