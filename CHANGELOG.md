# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.48.0] - 2026-03-15

### Added

- One-click install script (`install.sh`) supporting `curl | bash`, local clone, and in-project-dir scenarios
- `CodeAnalysisManager` extracted to `src/engine/runtime/code-analysis.ts`
- `MissionManager` / `MissionFileNames` / `ErrorCategory` exported from `src/engine/runtime/mission-io.ts`
- Branch coverage improvements across all runtime modules
- `StatePersistenceManager.setContext()` method for full context replacement
- `StateFileNames.LATEST_REPORT` and `StateFileNames.REPORT_HISTORY` constants
- GitHub Actions CI matrix (Node 20.x + 22.x)

### Changed

- `service.ts` refactored: dead code removed, runtime context delegated to `RuntimeContextManager`
- `loop-engine.ts` refactored: `CircuitBreaker` extracted, constant shadowing fixed, `as-any` cast removed
- `mission-manager.ts` → renamed to `mission-io.ts` for clarity
- Test suite expanded to **355 test cases** with full branch coverage on runtime modules

### Fixed

- `pytest-asyncio` support added for async test fixtures
- Circular import between `service.ts` and `runtime-context.ts` resolved
- `tsc --noEmit` reports zero errors

## [2.47.0] - 2026-03-10

### Added

- `CircuitBreaker` class in `src/engine/runtime/circuit-breaker.ts`
- `RuntimeContextManager` for logger/context injection
- `HealthMonitor` with configurable staleness threshold
- `ProviderHealthTracker` for LLM provider failover
- `StatePersistenceManager` with atomic writes and corruption recovery
- `ContextManager` for context compression and rotation
- Full test coverage for all runtime sub-modules (`circuit-breaker`, `ast-cache`, `zero-latency-loop`, `reporting`, `code-analysis`, `mission-io`, `state-persistence`, `health-monitor`, `provider-health`, `context-manager`)

### Changed

- Refactored `PerpetualEngineService` to delegate reliability concerns to runtime sub-modules
- `_mainLoop()` reduced from 400+ lines to focused orchestration

## [2.0.0] - 2026-02-01

### Added

- OpenClaw plugin interface (`plugin.ts`)
- HTTP routes for `/lobster/start`, `/lobster/stop`, `/lobster/status`, `/lobster/mission`
- RPC methods: `lobster.start`, `lobster.stop`, `lobster.status`, `lobster.setMission`
- Bearer token authentication for all HTTP and RPC endpoints
- `OPENCLAW_AUTH_TOKEN` environment variable support
- Zero-latency `while(isRunning)` perpetual loop
- Exponential backoff with circuit breaker (10 consecutive errors → auto-stop)
- Health monitor (300s stall → auto-stop)
- AST cache with LRU eviction and TTL
- State persistence with atomic writes to `~/.openclaw/.lobster-engine/`
- Telegram/Discord bot command integration
- Context compression on configurable interval

### Changed

- Complete rewrite from prototype to production-grade plugin

## [1.0.0] - 2026-01-15

### Added

- Initial prototype: perpetual AI agent loop
- Basic code analysis and task planning
- LLM provider abstraction layer
- Notification system (Telegram + Discord)
