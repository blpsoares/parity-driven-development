# Installing PDD for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed

## Installation

Add PDD to the `plugin` array in your `opencode.json` (global or project-level):

```json
{
  "plugin": ["pdd@git+https://github.com/blpsoares/parity-driven-development.git"]
}
```

Restart OpenCode. The plugin installs through OpenCode's plugin manager and registers PDD's
`/audit-*` skills. PDD is command-based, so nothing else is injected — invoke a command
(`/audit-bootstrap`, `/audit-new`, …) or just describe the task; OpenCode matches skills by
description too.

Verify by asking: "List your audit skills" or running `/audit-status` after `/audit-bootstrap`.

OpenCode uses its own plugin install. If you also use Claude Code, Codex, or another harness,
install PDD separately for each one — see the [README](../README.md#install-in-any-agent).

## The optional `pdd` dashboard

The plugin registers the commands; the terminal dashboard is separate and optional (Node or Bun,
no npm):

```bash
bash ~/.pdd/parity-driven-development/scripts/install-cli.sh   # or from a clone
pdd                                                            # navigable TUI
```
