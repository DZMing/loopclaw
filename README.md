# 🦞 LoopClaw — OpenClaw Plugin

> Zero-latency `while(isRunning)` perpetual loop — an autonomous AI Agent engine that runs 24/7/365
>
> 零延迟 `while(isRunning)` 永动循环 — 24/7/365 自治运行的 AI Agent 引擎

[![CI](https://github.com/DZMing/loopclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/DZMing/loopclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Features / 核心特性

- **Zero-latency perpetual loop** — a true `while(isRunning)` loop with no heartbeats and no sleeps
  **零延迟永动循环** — 真正的死循环，无心跳、无 sleep
- **Resilient error handling** — every error is converted into a prompt for the next iteration; the engine never stops
  **狂暴异常处理** — 任何错误都转化为下一轮提示词，引擎永不停止
- **Smart error classification** — errors are categorised by type (`file_io` / `parse` / `network` / `permission` / `timeout`)
  **智能错误分类** — 按类型自动识别、记录和恢复
- **Exponential back-off with circuit breaker** — auto slow-down (1 s → 60 s), auto-stop after 10 consecutive failures
  **指数退避熔断** — 连续错误自动减速，10 次连续错误自动熔断
- **State persistence** — atomic writes, restored on restart
  **状态持久化** — 原子写入，重启后自动恢复
- **Health monitoring** — auto-stops after 300 s without progress
  **健康监控** — 超过 300 秒无进度自动停止
- **AST cache** — LRU cache with checksum-based invalidation
  **AST 缓存** — LRU 缓存，checksum 失效机制
- **Finite task mode** — write tasks as Markdown checkboxes (`- [ ]`); auto-stops when all are `[x]`
  **有限任务模式** — 用 Markdown checkbox 写任务，全部完成后自动停止

---

## Installation / 安装

### One-command install (recommended) / 一键安装（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/DZMing/loopclaw/main/install.sh | bash
```

The script automatically: clones → installs dependencies → compiles → creates `.env` → registers the OpenClaw plugin → restarts the Gateway.

脚本自动完成：克隆 → 安装依赖 → 编译 → 创建 `.env` → 注册 OpenClaw 插件 → 重启 Gateway

### Local install / 本地安装

```bash
git clone https://github.com/DZMing/loopclaw.git
cd loopclaw
bash install.sh
```

### Install options / 安装选项

```bash
bash install.sh --help

# Custom install directory / 自定义安装目录
bash install.sh --dir ~/my-plugins/lobster

# Custom OpenClaw plugin directory / 自定义插件目录
bash install.sh --plugin-dir /opt/openclaw/plugins

# Copy files instead of symlinking / 复制而非符号链接
bash install.sh --no-link

# Skip OpenClaw registration (build only) / 跳过注册，仅构建
bash install.sh --no-openclaw
```

### Requirements / 系统要求

| Dependency / 依赖 | Minimum / 最低版本        |
| ----------------- | ------------------------- |
| Node.js           | 20+                       |
| npm               | 8+                        |
| git               | any / 任意                |
| openclaw CLI      | optional / 可选（注册用） |

---

## Usage / 使用

### Commands (Telegram / Discord) / 命令

```
/start_partner        Start the perpetual loop    启动永动循环
/stop_partner         Stop the perpetual loop     停止永动循环
/partner_status       Show engine status          查看引擎状态
/partner_mission      Set or view mission         设置或查看任务目标
/partner_analyze      Trigger code analysis       触发代码质量分析
/partner_compress     Trigger context compression 手动触发上下文压缩
```

### Example status output / 状态输出示例

```
🦞 Engine Status / 永动引擎状态

Running: yes                 运行中: 是
Loop count: 1234             循环次数: 1234
Avg loop time: 5 ms          平均耗时: 5ms
Loops per second: 200        循环速率: 200 循环/秒
Memory usage: 12.5 MB        内存使用: 12.5 MB
Error counts: file_io: 2     错误统计: file_io: 2
Context size: 2048 chars     上下文大小: 2048 字符
```

### Finite task mode / 有限任务模式

Add tasks as Markdown checkboxes in `MISSION_PARTNER.md`:

在 `MISSION_PARTNER.md` 中用 checkbox 格式写任务：

```markdown
## 具体任务

- [ ] Analyse code structure / 分析代码结构
- [ ] Check test coverage / 检查测试覆盖率
- [ ] Optimise performance bottleneck / 优化性能瓶颈
```

The engine picks the first unchecked task each iteration, marks it `[x]` on success, and auto-stops with a completion report when all tasks are done.

引擎每次取第一个未完成任务执行，成功后标记为 `[x]`，所有任务完成后发送完成报告并自动停止。

Numbered tasks (`1. …`) loop indefinitely — backward-compatible behaviour is unchanged.

数字格式（`1. 任务`）保持原有无限循环行为，完全向后兼容。

---

## Configuration / 配置

### Environment variables / 环境变量

| Variable                    | Default | Description / 说明                                        |
| --------------------------- | ------- | --------------------------------------------------------- |
| `LOBSTER_COMPRESS_INTERVAL` | `3`     | Context compression interval (loops) / 压缩间隔（循环数） |
| `LOBSTER_PERSIST_INTERVAL`  | `10`    | State persistence interval (loops) / 持久化间隔（循环数） |
| `LOBSTER_CACHE_TTL`         | `5000`  | File-analysis cache TTL (ms) / 分析缓存 TTL（毫秒）       |
| `LOBSTER_HEALTH_CHECK`      | `true`  | Enable stall protection / 启用防卡死监控                  |
| `LOBSTER_METRICS`           | `true`  | Enable performance metrics / 启用性能指标                 |
| `LOBSTER_CACHE`             | `true`  | Enable AST cache / 启用 AST 分析缓存                      |

```bash
cp .env.example .env
```

---

## Architecture / 架构

```
src/
├── plugin.ts              # Plugin entry / 插件入口
├── types.ts               # Shared type definitions / 公共类型
├── config.ts              # Config schema and defaults / 配置 schema
└── engine/
    ├── service.ts         # Core perpetual-loop engine / 核心永动引擎
    ├── zero-latency-loop.ts  # while(isRunning) loop substrate
    ├── ast-cache.ts       # LRU cache + memoisation
    ├── code-analyzer.ts   # Static code-quality analysis / 静态分析
    ├── code-fixer.ts      # Automated fix suggestions / 自动修复建议
    ├── task-planner.ts    # Task planning and scheduling / 任务规划
    ├── llm-provider.ts    # LLM API abstraction layer
    ├── notifier.ts        # Notification dispatch / 通知分发
    └── runtime/           # Runtime reliability sub-modules / 可靠性子模块
        ├── loop-engine.ts         # LoopEngineManager + circuit breaker
        ├── runtime-context.ts     # Logger/Context interfaces
        ├── state-persistence.ts   # Atomic state read/write / 原子读写
        ├── health-monitor.ts      # Active stall detection / 卡死检测
        ├── provider-health.ts     # LLM provider health tracking
        ├── mission-manager.ts     # MISSION/BOUNDARIES file management
        └── context-manager.ts    # Context compression and rotation

tests/
├── *.test.ts              # Node.js built-in test runner (node:test)
└── helpers.ts             # Shared test utilities
```

---

## Runtime reliability / 运行时可靠性

| Mechanism / 机制        | Parameter / 参数                | Behaviour / 行为                  |
| ----------------------- | ------------------------------- | --------------------------------- |
| Min loop interval       | 1 000 ms                        | Prevents 100 % CPU / 防 CPU 100%  |
| Error back-off / 退避   | Base 1 s, exponential, max 60 s | Auto slow-down / 连续错误自动减速 |
| Circuit breaker / 熔断  | 10 consecutive errors           | Auto-stop / 自动停止              |
| Stall protection / 防卡 | 300 s without progress          | Auto-stop / 自动停止              |

---

## Error classification / 错误分类与恢复

| Error type   | Recovery strategy / 恢复策略                         |
| ------------ | ---------------------------------------------------- |
| `file_io`    | Retry; check path & permissions / 重试，检查路径权限 |
| `parse`      | Use defaults / 使用默认值继续                        |
| `network`    | Offline mode; use cache / 切换离线，使用缓存         |
| `permission` | Read-only mode / 降级只读模式                        |
| `timeout`    | Increase timeout; simplify / 增加超时，简化操作      |
| `unknown`    | Log and skip / 记录并跳过                            |

---

## Development / 开发

```bash
npm install        # Install dependencies / 安装依赖
npm run build      # Compile TypeScript / 编译
npm run dev        # Watch mode / 监听模式
npm run clean      # Clean build output / 清理编译产物
npm test           # Run all tests / 运行全套测试
npx tsc --noEmit   # Type-check only / 仅类型检查
npm run perf       # Benchmarks / 基准测试
```

---

## Runtime state files / 运行时状态文件

- `~/.openclaw/.lobster-engine/engine-state.json` — engine state (loop count, context, …) / 引擎状态
- `~/.openclaw/.lobster-engine/suggestions.log` — optimisation suggestion log / 优化建议日志

---

## License

[MIT](LICENSE) © 2026 DZMing
