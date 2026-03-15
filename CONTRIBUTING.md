# Contributing to LoopClaw / 参与贡献

Thanks for your interest in contributing!
感谢你对本项目的兴趣！

---

## Prerequisites / 环境要求

- Node.js 20 or 22
- npm 9+
- TypeScript 5 (installed via `npm install`)

---

## Setup / 初始化

```bash
git clone https://github.com/DZMing/loopclaw.git
cd loopclaw
npm install
npm run build
```

---

## Running Tests / 运行测试

```bash
# Run all tests / 运行全套测试
npm test

# Type check only / 仅类型检查
npx tsc --noEmit

# Benchmarks / 基准测试
npm run perf
```

All tests must pass before submitting a PR. The CI workflow runs on Node.js 20 and 22.

提交 PR 前所有测试必须通过。CI 在 Node.js 20 和 22 上运行。

---

## Code Style / 代码风格

- **TypeScript strict mode** — no `any` without a comment explaining why
  **TypeScript 严格模式** — 不允许无注释的 `any`
- **File size limit**: 800 lines / **文件行数上限**：800 行
- **Function size limit**: 50 lines / **函数行数上限**：50 行
- Filenames: kebab-case; classes: PascalCase; functions: camelCase
  文件名 kebab-case；类 PascalCase；函数 camelCase
- Comments explain _why_, not _what_ / 注释解释"为什么"，而不是"做什么"

---

## Making Changes / 提交改动

1. Fork the repo and create a feature branch from `main`
   Fork 后从 `main` 创建 feature 分支
2. Write tests for any new behaviour — existing tests must not be weakened
   为新行为编写测试——禁止削弱已有测试
3. Keep commits atomic: one logical change per commit, ≤ 50 changed lines
   原子提交：每个 commit 只做一件事，≤ 50 行
4. Follow conventional commits: `feat(scope): description`, `fix(scope): description`, etc.
   遵循 Conventional Commits 格式
5. Run `npx tsc --noEmit && npm test` before pushing
   推送前必须跑类型检查和测试

---

## Pull Request Checklist / PR 检查清单

- [ ] Tests pass / 测试通过 (`npm test`)
- [ ] No new TypeScript errors / 无新 TS 错误 (`npx tsc --noEmit`)
- [ ] No secrets or personal data in diff / 无密钥或个人信息
- [ ] Commit messages follow conventional-commit format / commit 格式规范
- [ ] `README.md` updated if public API changes / 公开 API 变动需更新文档

---

## Architecture Overview / 架构概览

```
src/
├── plugin.ts              # OpenClaw plugin entry / 插件入口
├── types.ts               # Shared TypeScript types / 公共类型
├── config.ts              # Configuration schema and defaults / 配置 schema
└── engine/
    ├── service.ts         # Core perpetual-loop engine / 核心永动引擎
    ├── zero-latency-loop.ts  # while(isRunning) loop substrate
    ├── ast-cache.ts       # LRU cache and memoisation utilities
    ├── code-analyzer.ts   # Static code quality analysis / 静态分析
    ├── code-fixer.ts      # Automated fix suggestions / 自动修复建议
    ├── task-planner.ts    # Task planning and scheduling / 任务规划
    ├── llm-provider.ts    # LLM API abstraction layer
    ├── notifier.ts        # Notification dispatch / 通知分发
    └── runtime/           # Runtime reliability sub-modules / 可靠性子模块
        ├── loop-engine.ts         # LoopEngineManager + circuit-breaker constants
        ├── runtime-context.ts     # Shared logger/context interfaces
        ├── state-persistence.ts   # Atomic state read/write / 原子读写
        ├── health-monitor.ts      # Active stall detection / 卡死检测
        ├── provider-health.ts     # LLM provider health tracking
        ├── mission-manager.ts     # MISSION/BOUNDARIES file management
        └── context-manager.ts    # Context compression and rotation

tests/
├── *.test.ts              # Node built-in test runner (node:test)
└── helpers.ts             # Shared test utilities / 共享测试工具
```

---

## Reporting Bugs / 提交 Bug

Open a GitHub issue with / 请在 GitHub Issue 中提供：

- Node.js version / Node.js 版本
- Plugin version from `package.json` / 插件版本
- Steps to reproduce / 复现步骤
- Expected vs actual behaviour / 预期与实际行为
- Relevant log output (redact any tokens) / 相关日志（脱敏处理）
