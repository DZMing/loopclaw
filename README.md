# 🦞 LoopClaw — OpenClaw 插件

> 零延迟 `while(isRunning)` 永动循环，24/7/365 自治运行的 AI Agent 引擎

[![CI](https://github.com/DZMing/loopclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/DZMing/loopclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 核心特性

- **零延迟永动循环** — 真正的 `while(isRunning)` 死循环，无心跳、无 sleep
- **狂暴异常处理** — 任何错误都转化为下一轮提示词，引擎永不停止
- **智能错误分类** — 按类型（file_io / parse / network / permission / timeout）分类并记录
- **指数退避熔断** — 连续错误时自动退避（1s → 60s），10 次连续错误自动熔断
- **状态持久化** — 原子写入，定期保存状态到磁盘，重启后自动恢复
- **健康监控** — 超过 300 秒无进度时自动停止（防止卡死）
- **AST 缓存** — LRU 缓存代码分析结果，checksun 失效机制

## 安装

### 一键安装（推荐）

无需提前 clone，一条命令完成全部安装：

```bash
curl -fsSL https://raw.githubusercontent.com/DZMing/loopclaw/main/install.sh | bash
```

脚本会自动完成：克隆仓库 → 安装依赖 → 编译 → 创建 `.env` → 注册 OpenClaw 插件 → 重启 Gateway

### 本地安装（已 clone 的情况）

```bash
git clone https://github.com/DZMing/loopclaw.git
cd loopclaw
bash install.sh
```

### 安装选项

```bash
bash install.sh --help

# 自定义安装目录
bash install.sh --dir ~/my-plugins/lobster

# 自定义 OpenClaw 插件目录
bash install.sh --plugin-dir /opt/openclaw/plugins

# 复制文件而非符号链接
bash install.sh --no-link

# 跳过 OpenClaw 注册（仅构建）
bash install.sh --no-openclaw
```

### 系统要求

| 依赖         | 最低版本           |
| ------------ | ------------------ |
| Node.js      | 20+                |
| npm          | 8+                 |
| git          | 任意               |
| openclaw CLI | 可选（注册插件用） |

## 使用

### 在 Telegram/Discord 中发送命令

```
/start_partner        启动永动循环
/stop_partner         停止永动循环
/partner_status       查看引擎状态
/partner_mission      设置或查看任务目标
/partner_analyze      触发代码质量分析
/partner_compress     手动触发上下文压缩
```

### 状态输出示例

```
🦞 永动引擎状态

运行中: 是
循环次数: 1234
平均耗时: 5ms
循环速率: 200 循环/秒
内存使用: 12.5 MB
错误统计: file_io: 2, parse: 1
上下文大小: 2048 字符
```

## 配置

### 环境变量

| 变量                        | 默认值 | 说明                                                    |
| --------------------------- | ------ | ------------------------------------------------------- |
| `OPENCLAW_AUTH_TOKEN`       | 未设置 | **强烈建议设置** — HTTP 和 RPC 接口的 Bearer 鉴权 token |
| `LOBSTER_COMPRESS_INTERVAL` | `3`    | 上下文压缩间隔（循环数）                                |
| `LOBSTER_PERSIST_INTERVAL`  | `10`   | 状态持久化间隔（循环数）                                |
| `LOBSTER_CACHE_TTL`         | `5000` | 文件分析缓存 TTL（毫秒）                                |
| `LOBSTER_HEALTH_CHECK`      | `true` | 启用健康监控（防卡死）                                  |
| `LOBSTER_METRICS`           | `true` | 启用性能指标收集                                        |
| `LOBSTER_CACHE`             | `true` | 启用 AST 分析缓存                                       |

> ⚠️ **安全提醒**：未设置 `OPENCLAW_AUTH_TOKEN` 时，所有 HTTP 端点和 RPC 方法对任何调用方开放。
> 请在生产环境中**务必配置**此 token。

复制 `.env.example` 并填写：

```bash
cp .env.example .env
# 编辑 .env，至少设置 OPENCLAW_AUTH_TOKEN
```

### 认证

HTTP 端点使用 Bearer Token：

```bash
curl -H "Authorization: Bearer your_token" http://localhost:PORT/lobster/status
```

RPC 调用需要在 args 中传入 token：

```json
{ "method": "lobster.start", "args": ["your_token"] }
```

## 架构

```
src/
├── plugin.ts              # 插件入口 — 注册 HTTP 路由和 RPC 方法
├── types.ts               # OpenClaw 公共类型定义
├── config.ts              # 配置 schema 与默认值
└── engine/
    ├── service.ts         # 核心永动循环引擎 (PerpetualEngineService)
    ├── zero-latency-loop.ts  # while(isRunning) 循环底层实现
    ├── ast-cache.ts       # LRU 缓存 + memoization 工具
    ├── code-analyzer.ts   # 静态代码质量分析
    ├── code-fixer.ts      # 代码自动修复建议
    ├── task-planner.ts    # 任务规划与调度
    ├── llm-provider.ts    # LLM API 抽象层
    ├── notifier.ts        # 通知分发
    └── runtime/           # 运行时可靠性子模块
        ├── loop-engine.ts         # LoopEngineManager + 熔断常量
        ├── runtime-context.ts     # Logger/Context 接口定义
        ├── state-persistence.ts   # 原子状态读写
        ├── health-monitor.ts      # 主动卡死检测
        ├── provider-health.ts     # LLM Provider 健康追踪
        ├── mission-manager.ts     # MISSION/BOUNDARIES 文件管理
        └── context-manager.ts     # 上下文压缩与轮转

tests/
├── *.test.ts              # 基于 Node.js 内置 node:test 的测试套件
└── helpers.ts             # 共享测试工具
```

## 运行时可靠性保障

| 机制         | 参数                        | 行为               |
| ------------ | --------------------------- | ------------------ |
| 最小循环间隔 | 1000ms                      | 防止 CPU 100% 占用 |
| 错误退避     | BASE 1s，指数增长，上限 60s | 连续错误时自动减速 |
| 熔断器       | 连续 10 次错误              | 自动停止引擎       |
| 防卡死       | 300 秒无进度                | 自动停止引擎       |

## 错误分类与恢复

| 错误类型     | 恢复策略                       |
| ------------ | ------------------------------ |
| `file_io`    | 重试文件操作，检查文件路径权限 |
| `parse`      | 验证数据格式，使用默认值继续   |
| `network`    | 切换到离线模式，使用缓存数据   |
| `permission` | 降级操作，使用只读模式         |
| `timeout`    | 增加超时时间，简化操作         |
| `unknown`    | 记录并跳过                     |

## 开发

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 监听模式（自动重编译）
npm run dev

# 清理编译产物
npm run clean

# 运行全套测试
npm test

# 类型检查（不输出文件）
npx tsc --noEmit

# 运行基准测试
npm run perf
```

## 运行时状态文件

引擎状态持久化到：

- `~/.openclaw/.lobster-engine/engine-state.json` — 当前引擎状态（循环计数、上下文等）
- `~/.openclaw/.lobster-engine/suggestions.log` — 优化建议日志

## License

[MIT](LICENSE) © 2026 DZMing
