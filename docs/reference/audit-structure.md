---
title: "The .audit/ Structure"
description: "Complete schema of the generated .audit/ tree: files, finding folders, frontmatter fields, the evidence block, and the coverage map."
group: "reference"
order: 2
slug: "audit-structure"
---

# The `.audit/` Structure

PDD keeps all of its state on disk under `.audit/` in the project you are refactoring, porting, or
rewriting. This directory — not the model's context window — is the single source of truth for the
parity effort. It survives across sessions, developers, and agents, and it is what the `pdd` CLI and
`/audit-status` read. This page is the exhaustive schema of that tree: every file, every folder,
every frontmatter field, and the machine-readable blocks the commands write and consume.

For *why* state lives in files, see [State in files](../concepts/state-in-files.md). For the commands
that create and mutate this tree, see [Commands](commands.md).

## Directory layout

```
.audit/
├── BOOTSTRAP.md              reference/new adapters, preview mode, coverage baseline, thresholds
├── board.md                  tasks and cross-finding state
├── coverage.md               the parity coverage map
├── activity/                 live-presence files for running skills (transient)
│   └── audit-<cmd>-NNN.json
├── findings/
│   └── NNN-<slug>/           an open finding
│       ├── README.md         finding frontmatter + narrative (symptom, reproduction)
│       ├── investigation.md  root cause (written by /audit-investigate)
│       ├── resolution.md     fix + machine-readable `evidence` block + PR URL
│       └── refs/             evidence artifacts
│           ├── parity-<date>.diff
│           ├── parity-reference.png
│           └── parity-new.png
└── resolved/
    └── NNN-<slug>/           a finding that shipped (same internal shape as findings/)
```

`NNN` is a zero-padded three-digit id (`001`, `002`, …, `999`), unique across both `findings/` and
`resolved/`. `<slug>` is a 3–5 word kebab-case summary of the symptom (for example
`001-checkout-wrong-total`). The id and slug never change once assigned.

## Top-level files

| Path | Written by | Purpose |
|---|---|---|
| `BOOTSTRAP.md` | `/audit-bootstrap` | The operational context: reference-vs-new adapters, `CHECK_CMD`/`TEST_CMD`, project areas, reference cases, `QA_ENVIRONMENTS`/`QA_TARGET_ENV`, preview/branch mode, `CONFIDENCE_MIN`, and the inviolable rules. Every other command reads it and refuses to run if it is missing. |
| `board.md` | every `/audit-*` command | Human-readable task board grouped by lifecycle stage (`Available`, `Investigated (ready to resolve)`, `Resolved (last 7 days)`, …) plus any cross-finding notes. |
| `coverage.md` | `/audit-bootstrap`, `/audit-new`, `/audit-resolve`, `/audit-qa` | The machine-readable parity coverage map (see below). |

## The `activity/` directory

Each skill writes a JSON presence file when it starts and deletes it when it finishes — including on
early or aborted exits — so the `pdd` dashboard can show what is running live across parallel agents
and worktrees. These files are transient; a stale one signals a crashed session and can be swept with
`pdd prune`.

```
.audit/activity/audit-resolve-007.json
```

```json
{"command":"audit-resolve","finding":"007","worktree":"root","startedAt":"2026-07-01T14:22:05Z","agent":"blpsoares","pid":48213}
```

The `worktree` field is the literal `root` when the finding runs in the main checkout, or the
absolute worktree path when the finding was isolated.

## A finding folder — `findings/NNN-<slug>/`

A finding is the unit of work in PDD: one observed divergence between the new system and the
reference system. Its folder holds four things.

### `README.md`

Opens with a YAML frontmatter block, followed by the narrative (symptom, expected reference behavior,
reproduction steps, and any `## Observations during reproduction` recorded during `/audit-new`).

| Field | Type | Meaning |
|---|---|---|
| `id` | string | The zero-padded finding id, e.g. `007`. |
| `title` | string | One-line human title of the finding. |
| `slug` | string | Kebab-case slug used in the folder name, e.g. `checkout-wrong-total`. |
| `area` | string | The affected area/module, drawn from `PROJECT_AREAS` in `BOOTSTRAP.md` (free-form accepted). |
| `severity` | enum | One of `critical` · `high` · `medium` · `low`. |
| `status` | enum | The finding's lifecycle stage, e.g. `open`, `investigated`, `resolved`. |
| `discovered-at` | date | ISO date the finding was captured. |
| `discovered-by` | string | Author who captured it. |
| `confidence` | enum | The evidence tier: `tier-0` … `tier-3` (see [Evidence and tiers](../concepts/evidence-and-tiers.md)). At creation this is realistically `tier-0` or `tier-1` only. |
| `worktree` | string | Absolute path to the finding's isolated git worktree, or the literal `none` when the finding runs in the main checkout. |

Example:

```yaml
---
id: "007"
title: "Checkout total is wrong for multi-item orders"
slug: "checkout-wrong-total"
area: "checkout"
severity: "high"
status: "open"
discovered-at: "2026-07-01"
discovered-by: "blpsoares"
confidence: "tier-1"
worktree: "none"
---
```

### `investigation.md`

Written by `/audit-investigate` — a read-only root-cause analysis of the reference behavior. It may
contain an `Out of scope` section; when that section is filled in, `/audit-resolve` refuses to fix and
suggests closing the finding without a fix. `/audit-resolve` also refuses to run at all if this file
does not exist.

### `resolution.md`

Written by `/audit-resolve`. Contains the fix summary, the list of modified files with `file:line`
references, the characterization test path, the reference file/spec that guided the fix, the
check/test results, the parity evidence paths, and — critically — the machine-readable `evidence:`
block documented below.

### `refs/`

Evidence artifacts referenced from the frontmatter and the `evidence` block. Created by `/audit-new`
(so the developer always knows where to drop evidence) even when empty. Conventional contents:

| File | Produced by | Evidence tier it supports |
|---|---|---|
| `parity-reference.png` | manual capture / browser MCP | `tier-1` — paired screenshot of the reference system |
| `parity-new.png` | manual capture / browser MCP | `tier-1` — paired screenshot of the new system |
| `parity-<date>.diff` | `/audit-compare` | `tier-2` — automated data-to-data diff (an empty diff means parity confirmed) |

## `resolved/NNN-<slug>/`

When `/audit-resolve` completes, it moves the entire finding folder from `findings/` to `resolved/`
unchanged in internal shape (`README.md`, `investigation.md`, `resolution.md`, `refs/`). The id and
slug are preserved, so `resolved/007-checkout-wrong-total/` is the same finding that was
`findings/007-checkout-wrong-total/`. This move records that the fix shipped **locally** — it does not
imply the behavior is guaranteed. Guarantee comes only from QA approval plus a human merge.

## The `evidence` block

`resolution.md` embeds one YAML fenced block named `evidence:`. It is the machine-readable record of
parity proof, consumed by `/audit-pr` (to assemble the PR dossier) and by the `pdd` board.

```yaml
evidence:
  confidence: tier-3
  parity_diff: refs/parity-2026-07-01.diff
  characterization_test: tests/audit/007_checkout.test.ts
  screenshots: [refs/parity-reference.png, refs/parity-new.png]
  checks: { check: pass, test: pass }
  pr_url: https://github.com/org/repo/pull/42
```

| Key | Type | Rules |
|---|---|---|
| `confidence` | enum | The achieved tier (`tier-0` … `tier-3`). Must equal the finding's achieved evidence and must be ≥ `CONFIDENCE_MIN`; `/audit-resolve` blocks below it. |
| `parity_diff` | path | Path to the `/audit-compare` output under `refs/`, or `none`/omitted when no diff was produced (then the tier is ≤ 1). |
| `characterization_test` | path | Path to the characterization test in the project's real test suite, or `none - <reason>` when genuinely infeasible (the tier is then downgraded — a finding without a passing characterization test cannot be `tier-3`). |
| `screenshots` | list | Paths to paired reference-vs-new screenshots, or `[]` when none. |
| `checks` | map | Result of the static check and the test suite, each `pass` or `fail` (e.g. `{ check: pass, test: pass }`). |
| `pr_url` | url | Left as the placeholder `<filled by /audit-pr>` by `/audit-resolve`; `/audit-pr` fills it in for traceability after the human approves the push. |

## The coverage map — `coverage.md`

`coverage.md` is a machine-readable GFM table: the single view of how much of the reference system's
behavior is already verified, and at what confidence. It is seeded by `/audit-bootstrap`, moved to
`finding-open` by `/audit-new`, set to `resolved` by `/audit-resolve`, and promoted to `verified` by
`/audit-qa`.

```markdown
| Behavior / Area          | Reference case | Status        | Tier   | Finding |
|--------------------------|----------------|---------------|--------|---------|
| checkout: total          | order #123     | verified      | tier-3 | 007     |
| login: lock after 3 fails| test user      | finding-open  | tier-1 | 012     |
| export CSV               | —              | not-started   | —      | —       |
```

| Column | Meaning |
|---|---|
| `Behavior / Area` | The reference behavior being tracked for parity. |
| `Reference case` | The golden case used to exercise it, or `—` when none is assigned yet. |
| `Status` | The lifecycle stage of this behavior (see below). |
| `Tier` | The evidence tier backing the current status, or `—` when not started. |
| `Finding` | The finding id that covers this behavior, or `—` when none exists. |

### Status lifecycle

A behavior moves through these statuses, each written by a different command:

| Status | Set by | Meaning |
|---|---|---|
| `not-started` | `/audit-bootstrap` | Seeded baseline; no finding opened yet. |
| `finding-open` | `/audit-new` | A finding exists and is being worked. |
| `resolved` | `/audit-resolve` | The fix is done locally with evidence — a **claim**, not yet a guarantee. |
| `verified` | `/audit-qa` | QA approved on the target environment **and** the PR was merged — the only guaranteed state. |

**Parity coverage %** — the headline metric on the dashboard — is `verified / total`. Only `verified`
counts, because coverage is a guarantee metric. See [The coverage model](../concepts/coverage-model.md)
for the reasoning.

## Inviolable rules reflected in this tree

The structure enforces PDD's non-negotiable gates:

- **The AI never authors commits.** `/audit-resolve` writes `resolution.md`, moves the folder to
  `resolved/`, and updates `coverage.md` and `board.md` — but it never runs `git commit`. The human
  commits.
- **`push` and `gh pr create` happen only after an explicit human "yes"** in the same session, via
  `/audit-pr`, which then fills `pr_url` in the `evidence` block.
- **Merge is 100% human**, and a behavior only becomes `verified` in `coverage.md` after the target
  environment's QA is approved **and** the PR is merged.

For the full configuration behind `BOOTSTRAP.md`, see [Configuration](configuration.md).
