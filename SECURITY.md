# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 2.48.x  | ✅        |
| < 2.48  | ❌        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues by emailing the maintainer directly or opening a [private security advisory](https://github.com/zhimingdeng/lobster-perpetual-engine/security/advisories/new) on GitHub.

Include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

You can expect a response within **72 hours**. We aim to patch critical issues within 7 days.

## Security Notes

### Authentication Token

This plugin optionally reads `OPENCLAW_AUTH_TOKEN` from the environment:

- **If not set**: all HTTP endpoints and RPC methods are **open** (no auth). Only deploy without a token in trusted private networks.
- **If set**: HTTP endpoints require `Authorization: Bearer <token>`, and RPC callers must pass the token as an argument.

**Always set `OPENCLAW_AUTH_TOKEN` in production.**

### State Directory

Engine state is written to `~/.openclaw/.lobster-engine/`. Ensure this directory has appropriate filesystem permissions (readable only by the process user).
