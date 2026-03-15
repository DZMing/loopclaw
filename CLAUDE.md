# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**龙虾自动驾使** (Lobster Auto-Drive) is an AI Agent application that integrates with the OpenClaw plugin system.

### OpenClaw Integration

This project uses OpenClaw for plugin configuration and service management.

**Profile Verification (before any OpenClaw config changes):**

```bash
# Check current active profile
openclaw config get profile

# Verify configuration location
ls -la ~/.openclaw/profiles/
```

**Important:**

- Each bot requires independent tokens - never share tokens across bots
- Verify profile type: `default` (dev) vs `gateway` (production)
- Always backup configs before changes

### Configuration Backup (before changes)

```bash
# Backup entire config directory
timestamp=$(date +%Y%m%d_%H%M%S)
cp -r ~/.openclaw ~/.openclaw.backup.$timestamp
```

### Incremental Service Restart (after config changes)

```bash
# Restart core services first
openclaw restart gateway && sleep 5 && openclaw status gateway
# Then dependency services
openclaw restart database && sleep 3 && openclaw status database
# Finally auxiliary services
openclaw restart monitor
```

## Development Commands

_To be filled in as project develops:_

```bash
# Install dependencies
# npm install

# Run development server
# npm run dev

# Run tests
# npm test

# Build for production
# npm run build

# Lint code
# npm run lint
```

## Architecture

_To be documented as code is added:_

- **Entry Point:** (to be defined)
- **Plugin Interface:** OpenClaw plugin integration
- **AI Agent Layer:** (framework to be determined)

## Environment Variables

When editing `.env` files:

- **Always preserve comment symbols** (lines starting with `#`)
- **No spaces around `=`**: `KEY=value` not `KEY = value`
- **Restart services after saving:** `openclaw restart <service-name>`
