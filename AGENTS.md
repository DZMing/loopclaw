# Repository Guidelines

## Project Structure & Module Organization

`src/plugin.ts` is the OpenClaw entrypoint and registers chat commands and services. Core runtime code lives in `src/engine/`, including the perpetual loop, orchestrators, scheduling, telemetry, retries, and analysis helpers. Shared config is in [`src/config.ts`](src/config.ts). Tests live in `tests/`, with `engine.test.ts` for smoke-style checks and `benchmark.ts` for manual performance runs. Templates for generated mission files live in `templates/`. Build output goes to `dist/`; do not edit generated files there.

## Build, Test, and Development Commands

Use `npm run build` to compile TypeScript to `dist/`. Use `npm run dev` for watch mode while editing. Run `npm test` to execute the current engine smoke tests; it automatically builds first. Run `npm run lint` for strict type-checking with no emit. The checked-in `npm run perf` script is stale; use `npx tsx tests/benchmark.ts` until the script is fixed.

## Coding Style & Naming Conventions

This repository uses strict TypeScript with ES modules. Follow the existing 2-space indentation and keep imports using `.js` suffixes in TypeScript source. Use `PascalCase` for classes, `camelCase` for functions and variables, and kebab-case filenames for engine modules such as `zero-latency-loop.ts`. Prefer small exported helpers, `readonly` config fields, and explicit return types for public functions. Format source with `npm run format`.

## Testing Guidelines

Add or update tests whenever command behavior, engine state handling, or config validation changes. Keep test files in `tests/` and name them `*.test.ts` for automated checks. Favor small, executable smoke tests that assert engine state transitions and command-side effects. Before opening a PR, run `npm run build`, `npm run lint`, and `npm test`.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commit prefixes such as `feat(plugin):`, `docs:`, and `chore(progress):`. Keep commit scopes specific to the touched area, for example `feat(engine):` or `fix(config):`. PRs should summarize user-visible command changes, list any OpenClaw or env config changes, link the related issue or task, and include the commands you ran to verify the change. For chat-command changes, include a short sample response or transcript.

## Security & Configuration Tips

Start from `.env.example` when adding local config, and never commit real secrets or tokens. Runtime-generated `MISSION_PARTNER.md` and `BOUNDARIES_PARTNER.md` are ignored; treat them as ephemeral outputs, not source files. If you change OpenClaw-facing configuration, document the expected profile or gateway impact in the PR.
