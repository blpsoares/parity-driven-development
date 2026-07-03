# Installing PDD (any agent)

You can hand this file to any coding agent — *"Fetch and follow the instructions at
https://raw.githubusercontent.com/blpsoares/parity-driven-development/main/INSTALL.md"* — and it
will install PDD's commands into your environment. PDD is command-based (like `specify init`), not
hook-based, so installation just scaffolds the right command files for your agent.

## Fastest path — shell installer (no npm)

> **Run this inside the project you're refactoring/porting** — the target repo where you'll
> track parity, **not** a clone of this PDD repo. That target directory is where `.audit/`,
> `AGENTS.md`, and the agent command files get written.

Requires `git` and **Node or Bun** (no npm). `cd` into your target project first, then:

```bash
curl -fsSL https://pdd.openvibes.tech/cli | bash -s -- <harness>
```

Replace `<harness>` with `codex`, `cursor`, `copilot`, `gemini`, or `all`. Add `--global` to install
into your home config instead of the project. This also installs the optional `pdd` dashboard CLI.

(The PDD method itself needs no runtime — this just scaffolds the command files + the optional CLI.)

## Per-agent native install

Codex, Gemini CLI and Copilot CLI all discover the same convergent convention —
`.agents/skills/<name>/SKILL.md` at the project root (or `~/.agents/skills/` with `--global`) — so
one install writes files all three agents can read natively.

| Agent | Command |
|---|---|
| **Claude Code** | `/plugin marketplace add blpsoares/parity-driven-development` then `claude plugin install pdd@parity-driven-development --scope project` |
| **Codex** | `install.sh codex` → `.agents/skills/audit-*/SKILL.md`. Invoke via `/skills` (Codex picks by description, not by typing `/audit-new`) |
| **Gemini CLI** | `install.sh gemini` → `.agents/skills/audit-*/SKILL.md`. Run `/skills reload` after installing |
| **Copilot** (CLI or VS Code/JetBrains) | `install.sh copilot` → `.agents/skills/audit-*/SKILL.md`. Run `/skills reload` in Copilot CLI |
| **Cursor** | `install.sh cursor` → `.cursor/commands/audit-*.md` (Cursor doesn't read `.agents/skills`) |

If you already have the `pdd` CLI, `pdd init` detects your installed agents and installs into all of
them at once (or `pdd init codex cursor …` for specific ones). It refuses to run from your home
directory without `--global`, to avoid accidentally scattering project files into `~`.

## Manual fallback (no bun)

The commands are the `skills/*/SKILL.md` files in this repo — self-contained markdown instructions.
Copy each into your agent's prompt/command directory (see the table above for the path and naming),
and wherever a file says `$ARGUMENTS`, that is where the user's arguments go.

## After installing

Invoke `/audit-bootstrap` to initialize a project, then follow the cycle
(`new → investigate → resolve → compare → qa local → pr → qa env`). See
[`AGENTS.md`](AGENTS.md) for the full command reference.
