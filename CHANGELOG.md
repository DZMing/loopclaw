# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.50.0] - 2026-03-15

### Performance

- **`parseCheckboxTasks` result cache**: results are now cached keyed by mission string; the full line-scan is skipped on every loop iteration where the mission file hasn't changed — cache is invalidated whenever `markTaskComplete` writes to disk
- **`compressContext` guard**: the compress call (every N loops) is now skipped unless `actions` or `errors` actually exceeds their configured limits, eliminating unnecessary array allocations
- **`cleanExpiredCache` guard**: the `fileCache` traversal is skipped when the Map is empty (the common case), removing a no-op iteration every 2N loops

## [2.49.0] - 2026-03-15

### Added

- **Finite task mode**: write tasks as Markdown checkboxes (`- [ ] task`) in `MISSION_PARTNER.md`; the engine executes them in order, marks each `[x]` on completion, and auto-stops when all tasks are done
- `parseCheckboxTasks()` private method — detects checkbox format and returns pending/total task counts
- `markTaskComplete()` private method — atomic tmp-rename write to mark a task `[x]`; clears mission cache before reading to prevent stale-content overwrites; warns on match failure or I/O error instead of failing silently
- `ActionType.AUTO_SHUTDOWN` constant for the new auto-stop action type
- `escapeRegExp()` helper for safe use of task descriptions in `RegExp` constructor
- 6 new test cases covering checkbox parsing, `planNextAction` routing, `markTaskComplete` writes, and end-to-end auto-stop

### Changed

- `planNextAction()` priority 0 (new): returns `auto_shutdown` when all checkbox tasks are complete; priority 3 updated to use pending checkbox tasks when in checkbox mode (numbered format unchanged — fully backward-compatible)
- `runLoop()`: handles `auto_shutdown` action (sends completion report, calls `stopLoop()`, breaks loop); calls `markTaskComplete()` after a successful checkbox-mode execution

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
