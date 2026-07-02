# PDD — Parity-Driven Development

**A framework for reliable legacy refactor, rewrite, and port — with tracked behavioral parity.**

PDD turns "does the new system still behave like the old one?" from a gut feeling into
**objective, tracked evidence**. Every behavior of the reference (legacy) system becomes a
finding you can investigate, fix, prove, and gate through QA before it ever reaches `main`.

The framework is built on eight principles: **forced discipline / gates**, **state
externalized in files** (`.audit/` is the source of truth, not the model's context),
**small composable commands**, **objective evidence over opinion**, **a human at the gate
of every irreversible action**, **fast observable feedback**, **idempotent state-aware
commands**, and **progressive disclosure** (the cycle teaches itself).

> **Inviolable rule:** the AI never *authors* commits. `push` / `gh pr create` happen only
> after an explicit human **"yes"** in the same session. **Merge is 100% human** and only
> after QA approves.

---

## Installation

PDD ships as a single-plugin marketplace. Install it into a project:

```
/plugin marketplace add blpsoares/parity-driven-development
claude plugin install pdd@parity-driven-development --scope project
```

> **PDD only makes sense installed per-project** (`--scope project`). Its whole job is to
> track the parity of *one* migration against *one* reference system, and it stores that
> state in the project's `.audit/` directory. A global install has nothing to track.

**Coming from the old home?** If you installed PDD via `pdd@blpsoares-my-claude`, reinstall
it from the new marketplace above. PDD moved to its own dedicated repo.

---

## The cycle (QA before merge)

Run these skills one at a time. Each is gated: it refuses to advance on insufficient input.

```
/audit-bootstrap            once — captures preview/branch config, coverage baseline, thresholds
        │
        ▼
/audit-new <desc>           → finding NNN (+ initial confidence score, + coverage entry)
        │                      optionally isolates the work in a dedicated git worktree
        ▼
/audit-investigate NNN      → root cause
        │
        ▼
/audit-resolve NNN          → fix + characterization test + parity evidence
        │                      creates branch audit/NNN · does NOT commit
        ▼
   (human commits)
        │
        ▼
/audit-compare NNN          → golden-master harness: runs both systems, produces objective diff
        │
        ▼
/audit-pr NNN               → assembles the PR evidence dossier
        │                      push + gh pr create ONLY after human "yes" · opens QA on the branch
        ▼
/audit-qa NNN               → QA cards point at the branch/preview (testable, PR still OPEN)
        │
        ├─ ✅ all approved   → "🟢 QA approved — you may merge PR #X"   (a HUMAN merges)
        └─ ❌ rejected       → new finding on the SAME branch, loop back

/audit-status  ·  pdd board --watch     (at any moment)
```

**Golden rule of `audit-qa`:** QA runs once the **PR is open and testable** (branch or
preview), *before* merge — never after. **QA is the merge gate.**

### Worktree option

`/audit-new` asks whether to isolate a finding's work in a dedicated **git worktree**.

- **Yes** → creates worktree + branch `audit/NNN-<slug>` at
  `<repo-parent>/<repo>-audit-NNN` and records `worktree: <path>` on the finding.
  `investigate` / `resolve` / `compare` / `pr` then operate **inside that worktree**.
- **No** → records `worktree: none`; the branch is created by `resolve` in the main checkout.

---

## Skills

| Skill | What it does |
|---|---|
| `/audit-bootstrap` | One-time interview. Captures reference-vs-new adapters, preview/branch mode, seeds the coverage map, sets confidence thresholds. |
| `/audit-new <desc>` | Opens finding `NNN`, computes an initial confidence tier, adds a coverage entry, and asks the worktree-isolation question. |
| `/audit-investigate NNN` | Read-only root-cause investigation of the reference behavior. |
| `/audit-resolve NNN` | Fix + mandatory characterization test + machine-readable `evidence` block. Creates branch `audit/NNN`, does **not** commit. Blocks below `CONFIDENCE_MIN`. |
| `/audit-compare NNN` | **Golden-master harness.** Runs the same operation on both systems (CLI / DB / API / browser adapter) and emits an objective data-to-data diff (Tier 2 evidence). Read-only, confirms every query first. |
| `/audit-pr NNN` | Assembles the PR as an **evidence dossier** (symptom→cause→fix, tier, checks, characterization test, parity diff, paired screenshots, QA checklist). Pushes and opens the PR **only after an explicit human "yes."** |
| `/audit-qa NNN` | QA against the open PR's branch/preview. All approved → signals "you may merge"; rejected → new finding on the same branch. |
| `/audit-status` | In-chat panel: parity-coverage %, confidence distribution, active tasks, suggested next actions. |

---

## Confidence tiers

Every finding carries a confidence tier describing the **quality of its evidence**.

| Tier | Evidence | Label |
|---|---|---|
| **tier-0** | textual description only | 🔴 low |
| **tier-1** | paired screenshots (reference vs new) | 🟡 medium |
| **tier-2** | automated data-to-data diff (`/audit-compare`) | 🟠 high |
| **tier-3** | tier-2 **plus** a passing characterization test | 🟢 max |

The tier lives in the finding's frontmatter (`confidence`) and in the `evidence` block of
`resolution.md`. `audit-resolve` refuses to close a finding below `CONFIDENCE_MIN`
(default `tier-1`, `tier-2` recommended), set during bootstrap.

---

## The coverage map

`.audit/coverage.md` is a **machine-readable** table — the single view of *how much of the
legacy behavior is already verified, and at what confidence*. Seeded by `audit-bootstrap`,
moved to `finding-open` by `audit-new`, and to `verified` by `audit-resolve`.

```markdown
| Behavior / Area          | Reference case | Status        | Tier   | Finding |
|--------------------------|----------------|---------------|--------|---------|
| checkout: total          | order #123     | verified      | tier-3 | 007     |
| login: lock after 3 fails| test user      | finding-open  | tier-1 | 012     |
| export CSV               | —              | not-started   | —      | —       |
```

Status is one of `not-started` · `finding-open` · `verified`.
**Parity coverage %** = verified / total — the headline metric on the panel.

---

## The `pdd` CLI

A zero-dependency **Bun** tool that renders the same state as `/audit-status`, but as a
terminal panel you can keep open.

### Enabling the `pdd` command

Claude Code plugins can't register a binary on your PATH, so install the stable wrapper once
(it resolves the installed plugin version dynamically and survives `claude plugin update`):

```
bash ~/.claude/plugins/cache/parity-driven-development/pdd/*/scripts/install-cli.sh
# installs `pdd` to ~/.local/bin (pass another dir as $1 to override)
```

Then, from any project that ran `/audit-bootstrap`:

```
pdd                  # interactive, navigable dashboard (default) — ↑/↓ move, →/enter expand, ←/esc collapse, q quit
pdd tui              # same interactive dashboard, explicit
pdd board            # static ANSI snapshot (good for piping/CI)
pdd board --watch    # static auto-refresh whenever .audit/ changes (fs.watch)
```

The interactive TUI shows a collapsible tree: **Coverage**, **Worktrees** (expand a worktree
to see its branch, full path and findings), **Findings** grouped by lifecycle (open /
in-progress / done, each listing the finding ids), and **Active now** (live executions across
agents and worktrees). It refreshes live as `.audit/` changes.

It reads `board.md`, the findings' frontmatter, `coverage.md`, and the `evidence` blocks of
the resolutions. The CLI is optional — `/audit-status` covers the same ground in chat if
Bun isn't available.

---

## Generated `.audit/` structure

PDD keeps all state in the project under `.audit/` — it survives across sessions and devs.

```
.audit/
├── BOOTSTRAP.md            reference/new adapters, preview mode, coverage baseline, thresholds
├── board.md               tasks and cross-finding state
├── coverage.md            the parity coverage map
├── findings/NNN-<slug>/
│   ├── README.md          finding frontmatter (id, title, slug, area, severity,
│   │                      status, discovered-at/by, confidence, worktree)
│   ├── investigation.md   root cause
│   ├── resolution.md      fix + machine-readable `evidence` block + PR URL
│   └── refs/              parity-<date>.diff, parity-reference.png, parity-new.png
└── resolved/NNN-<slug>/   findings that shipped
```

The `evidence` block inside `resolution.md`:

```yaml
evidence:
  confidence: tier-3
  parity_diff: refs/parity-2026-07-01.diff
  characterization_test: tests/audit/007_checkout.test.ts
  screenshots: [refs/parity-reference.png, refs/parity-new.png]
  checks: { check: pass, test: pass }
  pr_url: https://github.com/org/repo/pull/42
```

---

## Language

The framework files are written in **English** because PDD is meant to be shared. But
language ≠ behavior: every skill instructs the AI to **interact with the dev in their
working language** — the example phrases in the skills are templates, not literal scripts.

---

## License

See the repository for license details.
