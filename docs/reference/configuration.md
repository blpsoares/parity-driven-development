---
title: "Configuration Reference"
description: "Every PDD configuration knob — the bootstrap-captured values in .audit/BOOTSTRAP.md, environment variables, their defaults, and where each is read."
group: "reference"
order: 3
slug: "configuration"
---

# Configuration Reference

PDD has two configuration surfaces:

1. **Bootstrap-captured values** — written once by `/audit-bootstrap` into
   `.audit/BOOTSTRAP.md` (and, for the coverage baseline, into `.audit/coverage.md`).
   These files are the source of truth every `/audit-*` command reads before it acts.
2. **Environment variables** — read from the process environment at runtime by the
   update-check machinery. None are required for the PDD method to work.

There is no separate config file, no JSON, and no CLI flag store: PDD keeps its
configuration as plain markdown under `.audit/`, versioned with the project. Editing
`.audit/BOOTSTRAP.md` by hand is supported — the values are read as text. To re-run the
guided interview and overwrite, use `/audit-bootstrap redo`.

This page is exhaustive. For the meaning and rationale behind the multi-phase QA knobs
see [../concepts/multi-phase-qa.md](../concepts/multi-phase-qa.md); for the commands that
read these values see [cli.md](cli.md) and [commands.md](commands.md).

---

## Bootstrap-captured values

All of the following live in `.audit/BOOTSTRAP.md`, written by `/audit-bootstrap`. The
"Section" column is the numbered section of the bootstrap interview / template that owns
the value.

### Adapters and reference system

| Key | Section | Meaning | Default | Read by |
|---|---|---|---|---|
| `REFERENCE_NAME` | 2 | Name of the reference (legacy / spec / previous) system — the "answer key". | none — `<pending>` until answered | every finding as the parity baseline; `/audit-investigate`, `/audit-compare` |
| `REFERENCE_TYPE` | 2 | Kind of reference system (PHP app, external service, spec, another running system). | `<pending>` | `/audit-investigate`, `/audit-compare` |
| `REFERENCE_ACCESS` | 2 | How to reach the reference system (URL, local path, VPN, login, MCP). | `<pending>` | `/audit-investigate`, `/audit-compare` |
| `REFERENCE_RESTRICTIONS` | 2 | Write/read restrictions (e.g. reference DB is read-only). | none | `/audit-investigate`, `/audit-compare` |
| `CHECK_CMD` | 3 | Static-verification command (typecheck / lint / compile), e.g. `bun run check`. | `<pending>` | `/audit-resolve` (must pass before close) |
| `TEST_CMD` | 3 | Test-suite command, e.g. `bun run test`. | `<pending>` | `/audit-resolve` (must pass before close) |
| MCP / DB adapters | 8, 9 | Databases and MCPs available for golden-master comparison (CLI / DB / API / browser). Credentials are stored as **pointers only**, never values. | none | `/audit-compare` selects the adapter; `/audit-qa` for browser QA |

The reference-vs-new distinction is the spine of the framework: the reference system is
the "answer key", the new system is what you are proving parity against. `CHECK_CMD` and
`TEST_CMD` are the gate `/audit-resolve` runs — both must be green before a finding can be
closed.

### QA environments and preview

Captured in Section 11 of the bootstrap. QA is multi-phase: `local` runs on localhost
**before** the PR (its approval is a blocking precondition of `/audit-pr`); each deployment
environment runs **after** the PR/deploy.

| Key | Meaning | Default | Read by |
|---|---|---|---|
| `QA_ENVIRONMENTS` | Ordered chain a change flows through, starting with `local`, e.g. `local, staging, prod`. | none — must be answered | `/audit-qa` (validates the `<env>` argument), `/audit-status`, `pdd` |
| `QA_TARGET_ENV` | Which environment's QA is the **guarantee**: once its `qa-<env>` is approved **and** the PR is merged, coverage becomes `verified`. | the **last** environment in `QA_ENVIRONMENTS` (e.g. `prod`) | `/audit-qa` (promotion to `verified`), coverage %, `/audit-status` |
| `PREVIEW_MODE` | Whether the pre-merge PR gets a deploy. One of `per-branch-url` or `local`. | `local` when there is no per-branch/per-PR deploy | `/audit-qa` (how to reach the branch under test) |
| `PREVIEW_URL_PATTERN` | Template for the preview URL when `PREVIEW_MODE = per-branch-url`, e.g. `https://pr-{N}.preview.app` (`{N}` = PR number, `{branch}` = branch name). | `none` when `PREVIEW_MODE = local` | `/audit-qa` (constructs the QA target URL) |
| Per-env URLs / access | For each deployment environment: URL and any VPN/login/manual step. | none | `/audit-qa` |

`PREVIEW_MODE` has exactly two values:

| Value | Behavior |
|---|---|
| `per-branch-url` | A per-branch or per-PR deploy exists. `PREVIEW_URL_PATTERN` holds the template; `/audit-qa` builds the URL from it. |
| `local` | No preview deploy. `PREVIEW_URL_PATTERN = none`; `/audit-qa` emits local checkout instructions instead. |

Because `verified` requires the **target-environment** QA plus a merge, changing
`QA_TARGET_ENV` changes what "done" means for every coverage row. See
[../concepts/multi-phase-qa.md](../concepts/multi-phase-qa.md).

### Confidence threshold

Captured in Section 12. Every finding carries a confidence tier describing the quality of
its evidence.

| Key | Meaning | Default | Recommended | Read by |
|---|---|---|---|---|
| `CONFIDENCE_MIN` | The **minimum evidence tier** required to close a finding. `/audit-resolve` refuses to close anything below it. | `tier-1` | `tier-2` | `/audit-resolve` (the confidence gate) |

The tier ladder is fixed — you set only the floor:

| Tier | Evidence | Label |
|---|---|---|
| `tier-0` | textual description only | 🔴 low |
| `tier-1` | paired screenshots (reference vs new) | 🟡 medium |
| `tier-2` | automated data-to-data diff (`/audit-compare`) | 🟠 high |
| `tier-3` | tier-2 **plus** a passing characterization test | 🟢 max |

If the dev expresses no preference during bootstrap, `CONFIDENCE_MIN` is recorded as
`tier-1`. The achieved tier is written to each finding's `confidence` frontmatter and to
the `evidence` block of its `resolution.md`. See
[../concepts/evidence-and-tiers.md](../concepts/evidence-and-tiers.md).

### Coverage baseline

Captured in Section 15 and written **verbatim** to `.audit/coverage.md`. This is the
seed of the parity coverage map — one row per behavior/area drawn from `PROJECT_AREAS`
(Section 6) and `REFERENCE_CASES` (Section 10).

| Aspect | Value |
|---|---|
| File written | `.audit/coverage.md` |
| Columns | `Behavior / Area` · `Reference case` · `Status` · `Tier` · `Finding` |
| Seed status | every row starts `not-started`, with empty `Tier` and `Finding` |
| Status values | `not-started` · `finding-open` · `resolved` · `verified` |
| Coverage % | `verified` rows ÷ total rows (locally-`resolved` rows show as *pending QA*, not counted) |
| Read/updated by | `/audit-new` (→ `finding-open`), `/audit-resolve` (→ `resolved`), `/audit-qa` (→ `verified`), `/audit-status`, `pdd` |

`resolved` means the fix is done locally but **not yet guaranteed**. A row only reaches
`verified` after the `QA_TARGET_ENV` QA is approved and the PR is merged — and **merge is
100% human**. See [../concepts/coverage-model.md](../concepts/coverage-model.md).

### Other bootstrap sections

These are captured but are context rather than tunable knobs; they are listed for
completeness.

| Section | Key(s) | Purpose |
|---|---|---|
| 1 | `MISSION`, `TARGET_DATE`, `HARD_LAUNCH_DATE` | Project mission and dates. |
| 4 | `PEOPLE_TABLE`, `SCOPE_AUTHORITY` | Humans, roles, final scope authority. |
| 5 | `REPOSITORIES_TABLE` | Relevant repos and local paths. |
| 6 | `PROJECT_AREAS` | Modules/screens used to group findings and seed coverage. |
| 7 | `ENVIRONMENTS_TABLE` | New-vs-reference URLs per environment. |
| 8 | databases | Hosts, roles, and credential **pointers** (never values). |
| 9 | MCPs | Available MCPs and their roles. |
| 10 | `REFERENCE_CASES` | Concrete answer-key artifacts (orders, IDs, test users). |
| 13 | `NOTION_STATUS`, `NOTION_URLS_TABLE` | QA-board integration; `Disabled` runs `/audit-qa` with a file-based checklist. |
| 14 | `PROJECT_RULES` | Project-specific inviolable rules, in addition to PDD's own. |

Section 14 always records PDD's inviolable rules regardless of the project: the AI never
authors commits; `push` / `gh pr create` happen only after an explicit human "yes" in the
same session; merge is human, and only after the target-environment QA approves.

---

## Environment variables

Read from the process environment at runtime. None affect the audit method — they only
govern the optional update-check behavior.

| Variable | Values | Default | Effect | Read by |
|---|---|---|---|---|
| `PDD_NO_UPDATE_CHECK` | `1` to opt out; unset otherwise | unset (checks enabled) | When set to `1`, disables **all** update checks: the Claude Code SessionStart tip, the `pdd` dashboard 🔔 notice, and the on-demand check. | `scripts/session-update-check.sh` and `dist/pdd.js` |

Set it in your shell profile or per-invocation:

```bash
# Per command
PDD_NO_UPDATE_CHECK=1 pdd board

# For the whole session
export PDD_NO_UPDATE_CHECK=1
```

Update checks are otherwise cached (checked at most once a day) and offline-safe. On
demand you can always run `pdd check`. See [cli.md](cli.md) for the full CLI surface.

---

## Where each value is read

A quick map from consumer to configuration, for auditing what a given command depends on.

| Consumer | Reads |
|---|---|
| `/audit-new` | `PROJECT_AREAS`, `REFERENCE_CASES`, `.audit/coverage.md` |
| `/audit-investigate` | reference-system keys (Section 2), MCPs, databases |
| `/audit-resolve` | `CHECK_CMD`, `TEST_CMD`, `CONFIDENCE_MIN` |
| `/audit-compare` | reference-system keys, DB/MCP/API/browser adapters |
| `/audit-qa` | `QA_ENVIRONMENTS`, `QA_TARGET_ENV`, `PREVIEW_MODE`, `PREVIEW_URL_PATTERN`, per-env URLs, `NOTION_*` |
| `/audit-pr` | `qa-local` approval state, PR body inputs |
| `/audit-status`, `pdd` | `.audit/coverage.md`, findings' frontmatter, `board.md`, `evidence` blocks |
| update checks | `PDD_NO_UPDATE_CHECK` |

Any bootstrap field left unanswered is recorded literally as
`<pending — fill before any /audit-new>`; `/audit-bootstrap` warns you how many remain,
and they must be filled before the first `/audit-new`.
