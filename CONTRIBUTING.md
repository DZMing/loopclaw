# Contributing to 龙虾永动引擎

感谢你对本项目的兴趣！以下是参与贡献的指南。

## Prerequisites

- Node.js 20 or 22
- npm 9+
- TypeScript 5 (installed via `npm install`)

## Setup

```bash
git clone https://github.com/zhimingdeng/lobster-perpetual-engine.git
cd lobster-perpetual-engine
npm install
npm run build
```

## Running Tests

```bash
# Run all tests
npm test

# Type check only (no compilation output)
npx tsc --noEmit

# Run benchmarks
npm run perf
```

All tests must pass before submitting a PR. The CI workflow runs on Node.js 20 and 22.

## Code Style

- **TypeScript strict mode** — no `any` without a comment explaining why
- **File size limit**: 800 lines per file
- **Function size limit**: 50 lines per function
- Exports follow kebab-case filenames, PascalCase classes, camelCase functions
- Comments explain _why_, not _what_

## Making Changes

1. Fork the repo and create a feature branch from `main`
2. Write tests for any new behaviour — existing tests must not be weakened
3. Keep commits atomic: one logical change per commit, ≤50 changed lines
4. Follow conventional commits: `feat(scope): description`, `fix(scope): description`, etc.
5. Run `npx tsc --noEmit && npm test` before pushing

## Pull Request Checklist

- [ ] Tests pass (`npm test`)
- [ ] No new TypeScript errors (`npx tsc --noEmit`)
- [ ] No secrets or personal data in diff
- [ ] Commit messages follow conventional-commit format
- [ ] `README.md` updated if public API changes

## Architecture Overview

```
src/
├── plugin.ts              # OpenClaw plugin entry — registers HTTP routes and RPC methods
├── types.ts               # Shared TypeScript types
├── config.ts              # Configuration schema and defaults
└── engine/
    ├── service.ts         # Core perpetual-loop engine (PerpetualEngineService)
    ├── zero-latency-loop.ts  # while(isRunning) loop substrate
    ├── ast-cache.ts       # LRU cache and memoization utilities
    ├── code-analyzer.ts   # Static code quality analysis
    ├── code-fixer.ts      # Automated code fix suggestions
    ├── task-planner.ts    # Task planning and scheduling
    ├── llm-provider.ts    # LLM API abstraction layer
    ├── notifier.ts        # Notification dispatch
    └── runtime/           # Runtime reliability sub-modules
        ├── loop-engine.ts         # LoopEngineManager + circuit-breaker constants
        ├── runtime-context.ts     # Shared logger/context interfaces
        ├── state-persistence.ts   # Atomic state read/write
        ├── health-monitor.ts      # Active stall detection
        ├── provider-health.ts     # LLM provider health tracking
        ├── mission-manager.ts     # MISSION/BOUNDARIES file management
        └── context-manager.ts    # Context compression and rotation

tests/
├── *.test.ts              # Node built-in test runner (node:test)
└── helpers.ts             # Shared test utilities
```

## Reporting Bugs

Open a GitHub issue with:

- Node.js version
- Plugin version (from `package.json`)
- Steps to reproduce
- Expected vs actual behaviour
- Relevant log output (redact any tokens)
