---
title: "Install: Claude Code"
description: "Install PDD in Claude Code as a native, per-project plugin, plus the pdd CLI PATH wrapper."
group: "get-started"
order: 3
slug: "install-claude-code"
---

# Install: Claude Code

In Claude Code, PDD installs as a **first-class native plugin** from its own single-plugin
marketplace. The plugin ships the `/audit-*` skills, the `pdd` CLI, and an opt-in SessionStart
update tip — no shell installer required.

> **Run this from the project you're refactoring, rewriting, or porting** — the target repo whose
> parity you track against the reference (legacy) system. Not from a clone of the PDD repo itself.
> PDD writes its state into that project's `.audit/` directory.

## 1. Add the marketplace

```bash
/plugin marketplace add blpsoares/parity-driven-development
```

This registers the PDD marketplace with Claude Code. It is a single-plugin marketplace: the only
thing it publishes is `pdd`.

## 2. Install the plugin, per project

```bash
claude plugin install pdd@parity-driven-development --scope project
```

Use `--scope project` deliberately. PDD's entire job is to track the parity of **one** migration
against **one** reference system, and it stores that tracking state in the project's `.audit/`
directory. A global install has nothing to track — there is no single `.audit/` for it to point at.
Per-project scope also means the plugin travels with the repo: every developer and every session
sees the same commands and the same coverage map.

Installing the plugin gives you three things:

| Component | What it is |
|---|---|
| Skills | The gated `/audit-*` slash commands (`/audit-bootstrap`, `/audit-new`, …). |
| `pdd` CLI | The optional terminal dashboard that renders the same state as `/audit-status`. |
| SessionStart tip | An **opt-in** hook that checks for a newer PDD version and, when one exists, proactively offers to summarize the CHANGELOG and run the update — once per version, never nagging. |

## 3. Verify and start

Confirm the slash commands are available, then run the one-time interview:

```bash
/audit-bootstrap
```

`/audit-bootstrap` captures the reference-vs-new adapters, the QA environments, the coverage
baseline, and the minimum confidence tier. Nothing else in the cycle works until it has run. From
there the cycle is `/audit-new` → `/audit-investigate` → `/audit-resolve` → `/audit-compare` →
`/audit-qa local` → `/audit-pr` → deploy → `/audit-qa <env>`. Local QA is the blocking
precondition of the PR; environment QA (dev/staging/prod) runs after the PR and deploy. See the
[Quickstart](../../QUICKSTART.md) for the full walkthrough.

## 4. Install the `pdd` CLI PATH wrapper

The CLI ships with the plugin — it runs `dist/pdd.js` on **Node**, or the source on **Bun** (no
npm). To get a stable `pdd` command on your `PATH`, install the wrapper once:

```bash
bash ~/.claude/plugins/cache/parity-driven-development/pdd/*/scripts/install-cli.sh
# installs `pdd` to ~/.local/bin
```

If `~/.local/bin` is not on your `PATH`, the script warns you — add it, then reopen your shell.
After that, `pdd` works from any project that has run `/audit-bootstrap`; with no path argument it
walks up from the current directory to find `.audit/`. The CLI is optional: `/audit-status` gives
the same information in-chat with zero dependencies. Full command list in the
[CLI reference](../reference/cli.md).

## Updating

Because the plugin ships a SessionStart hook, Claude Code will tell you when a newer PDD version
exists and offer to run the update for you. To update on demand:

```bash
claude plugin update pdd@parity-driven-development
```

If you also drive PDD from other agents (Codex, Cursor, Copilot, Gemini), run `pdd init` afterward
to refresh their generated command files, which are static snapshots and don't auto-update. Opt out
of all update checks with `PDD_NO_UPDATE_CHECK=1`.

## Migrating from the old plugin home

Earlier builds of PDD were distributed from the `pdd@blpsoares-my-claude` home. PDD has since moved
to its own dedicated repository and marketplace. If you installed it the old way, reinstall from the
new marketplace:

```bash
/plugin marketplace add blpsoares/parity-driven-development
claude plugin install pdd@parity-driven-development --scope project
```

Your `.audit/` state is unaffected by the move — it lives in your project, not in the plugin, so it
carries straight over.

## The rules the plugin never breaks

PDD is built around a human at the gate of every irreversible action, and installing it in Claude
Code changes none of that:

- The AI **never authors commits** — you commit after `/audit-resolve`.
- `push` and `gh pr create` happen **only after an explicit human "yes"** in the same session.
- **Merge is 100% human**, and only after the target-environment QA approves.

## Next steps

- [Install: other agents](./other-agents.md) — Codex, Cursor, Copilot, Gemini.
- [CLI reference](../reference/cli.md) — every `pdd` subcommand.
- [Commands reference](../reference/commands.md) — every `/audit-*` command in detail.
- [Configuration reference](../reference/configuration.md) — bootstrap-captured values and env vars.
