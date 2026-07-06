---
title: "State Lives in Files"
description: "Why PDD keeps every finding, tier, and coverage entry in .audit/ on disk instead of in an agent's ephemeral context window."
group: "concepts"
order: 6
slug: "state-in-files"
---

# State Lives in Files

PDD keeps all of its state in one place: the project's `.audit/` directory. That directory —
not the agent's chat history, not the model's context window — is the **single source of truth**
for how much of the reference system's behavior you have proven the new system reproduces.

This is the second of the [eight principles](./the-eight-principles.md): *state externalized in
files*. It sounds like an implementation detail. It is actually the decision that makes every
other guarantee in PDD durable.

## The problem with state in a chat

An AI agent's working memory is its context window, and a context window is **ephemeral**. It
ends when the session ends. It is private to one agent on one machine. It gets compacted,
truncated, and summarized as the conversation grows. And it is unauditable — nobody can diff it,
review it in a pull request, or check it into git.

A parity migration is the opposite of ephemeral. It spans weeks. It is handed between developers.
It runs across a laptop, a CI runner, and a teammate's machine. It might be driven by Claude Code
today and Codex tomorrow. If the record of *"which behaviors are verified, at what confidence
tier, with what evidence"* lived only in a chat transcript, it would evaporate the moment that
transcript did — and you would be back to the gut feeling PDD exists to eliminate.

So PDD refuses to keep state in the conversation. It writes it down.

## What lives in `.audit/`

Everything material to parity is a plain file on disk:

```
.audit/
├── BOOTSTRAP.md          reference/new adapters, QA environments, thresholds
├── board.md              tasks and cross-finding state
├── coverage.md           the parity coverage map
└── findings/NNN-<slug>/
    ├── README.md         finding frontmatter (status, confidence tier, worktree…)
    ├── investigation.md  root cause
    ├── resolution.md     the fix + the machine-readable evidence block
    └── refs/             parity diffs and paired screenshots
```

A finding's confidence tier, its status in the coverage lifecycle, its evidence block, and its PR
URL are all text. The `evidence` block inside `resolution.md` is deliberately machine-readable
YAML so any tool or agent can consume it without re-deriving it from prose. See
[reference/audit-structure.md](../reference/audit-structure.md) for the exact schema of every file
and frontmatter field.

## What externalized state buys you

Because the truth is on disk, not in a head:

| Property | Consequence |
|---|---|
| **Survives sessions** | Close the session, come back next week, run `/audit-status` — the coverage map, the open findings, and their tiers are exactly as you left them. |
| **Survives developers** | A teammate clones the repo and sees the same verified/finding-open/not-started picture. Progress is shared, not trapped in one person's transcript. |
| **Survives machines** | The state travels with the repository — laptop, CI, or a fresh checkout on a server all read the same `.audit/`. |
| **Survives agents** | PDD is harness-agnostic. `.audit/` is plain markdown; Claude Code, Codex, Cursor, Copilot, and Gemini all read and write the same files. The method outlives any single tool. |
| **Auditable** | State is diffable and reviewable. A finding's evidence lands in the PR dossier as files a human can inspect — the whole point of parity being *tracked* rather than *felt*. |

The optional `pdd` CLI is the clearest proof of this design: it is a pure reader of `.audit/`. It
reconstructs the entire dashboard — coverage percentage, confidence distribution, active work,
worktrees — from `board.md`, the findings' frontmatter, `coverage.md`, and the resolution
`evidence` blocks. It holds no state of its own. `/audit-status` renders the same picture in-chat
from the same files. Two different front-ends, one source of truth.

## Idempotent, state-aware commands

Because each command reads the current state from disk before it acts, the commands are
**idempotent and safe to re-run**. `/audit-new` looks at the existing findings to allocate the
next `NNN`. `/audit-resolve` checks a finding's current status and confidence tier before it
touches anything, and refuses to close below `CONFIDENCE_MIN`. `/audit-pr` reads whether
`qa-local` is approved and **blocks** if it is not. Re-running a command after a crash, a
disconnect, or a context reset does not corrupt anything — the command simply re-reads the files
and resumes from wherever the on-disk state actually is. There is no hidden in-memory state to
get out of sync with reality.

This is also why an interrupted session is a non-event. The agent's context may be gone, but the
finding, its investigation, its evidence, and the coverage entry are all still on disk. Any agent
— the same one or a different one — picks the files back up and continues.

## The inviolable rules still hold

Externalized state changes *where the record lives*; it never relaxes the gates. Writing a
`resolution.md` is not committing — the AI still **never authors commits**. Recording `qa-local:
approved` in a finding does not push anything — `push` and `gh pr create` happen only after an
explicit human **"yes"** in the same session. And no file PDD writes can merge a pull request:
**merge is 100% human**, only after the target-environment QA approves. The files are the memory;
the human is still the gate.

## Related

- [The Eight Principles](./the-eight-principles.md) — where *state externalized in files* sits
  among PDD's foundations.
- [reference/audit-structure.md](../reference/audit-structure.md) — the exact schema of every file
  under `.audit/`.
