# PDD Docs Excellence Rollout — Design

**Date:** 2026-07-06
**Status:** Approved (shape) — implementation via parallel agent workflow
**Goal:** Bring PDD's documentation to spec-kit-level completeness and polish, using a
markdown-first (single-source) architecture shared between the `parity-driven-development`
repo and the `pdd-site` React app.

---

## Problem

PDD's `README.md` is strong, but the surrounding docs ecosystem is thin compared to
github/spec-kit. Two concrete gaps:

1. **No explanation/methodology layer.** The eight principles, the evidence model, the
   coverage metric, and the multi-phase QA rationale exist only as terse README summaries.
   There is no "why" documentation (the Diátaxis *explanation* quadrant), no how-to *guides*,
   and reference material is tangled into the tutorial-style README.
2. **Content is duplicated.** Docs live once in `README.md` and again, hand-rewritten as React
   components, in `pdd-site` (`src/pages/Docs/sections/*.tsx`). Adding depth this way doesn't
   scale.

## Architecture decision: markdown as single source

- **Canonical content** lives as `.md` in **this repo** under `docs/`, organized by Diátaxis
  quadrant. This is the source of truth for both GitHub readers and the website.
- **The site** (`pdd-site`) stops hand-authoring docs sections and instead **renders the
  markdown**: it consumes `docs/**/*.md` (via git submodule of this repo), parses frontmatter
  to build the sidebar nav, and renders bodies with `react-markdown` + `remark-gfm` +
  syntax highlighting. The marketing landing (three.js/framer) is untouched.
- **Language:** docs content is authored in **English** (matches the framework's stated policy
  — framework files are English so they're shareable). The site keeps its en/pt UI toggle for
  chrome; Portuguese translation of doc *bodies* is a later wave, not a blocker.

### Frontmatter contract (read by the site nav builder)

Every `docs/**/*.md` page starts with:

```yaml
---
title: "Human title shown as H1 and sidebar label"
description: "One-line summary for meta + sidebar tooltip"
group: "get-started" | "concepts" | "guides" | "reference"
order: 1            # sort order within the group
slug: "what-is-pdd" # URL slug; must be unique
---
```

Nav group display order: **get-started → concepts → guides → reference**.

---

## Content architecture (Diátaxis)

### `docs/README.md` — docs index
Landing page for the docs tree: what PDD is in two sentences, the four quadrants with links,
and a "start here" pointer to the quickstart.

### Concepts (explanation — the "why", the biggest gap)
| File | Covers |
|---|---|
| `concepts/what-is-pdd.md` | The parity problem; why "does it still behave the same?" as gut-feeling fails; the finding→evidence→gate core idea; who PDD is for (refactor/rewrite/port). |
| `concepts/the-eight-principles.md` | Deep dive on each of the 8 principles: forced discipline/gates, state externalized in files, small composable commands, objective evidence over opinion, human at the gate of irreversible actions, fast observable feedback, idempotent state-aware commands, progressive disclosure. One section each: what it means, why it exists, how it shows up in the commands. |
| `concepts/evidence-and-tiers.md` | The philosophy of objective evidence; the four confidence tiers (tier-0…tier-3) and *why* each threshold matters; how `CONFIDENCE_MIN` gates resolution. |
| `concepts/coverage-model.md` | Parity coverage as the headline metric; the `not-started → finding-open → verified` lifecycle; why `verified` requires QA + human merge, never local resolution alone. |
| `concepts/multi-phase-qa.md` | Why QA runs local (pre-PR, unblocks `/audit-pr`) and per-environment (post-deploy); `qa-<env>` state; `QA_TARGET_ENV`; why merge is 100% human. |
| `concepts/state-in-files.md` | Why `.audit/` is the source of truth, not the model's context window; how this survives across sessions, devs, and agents; idempotent state-aware commands. |

### Reference (information-oriented, dry)
| File | Covers |
|---|---|
| `reference/commands.md` | Every `/audit-*` command: purpose, arguments, gates/preconditions, inputs read, outputs written, failure modes. One subsection per command. |
| `reference/audit-structure.md` | Full `.audit/` schema: directory layout, finding `README.md` frontmatter fields, `investigation.md`/`resolution.md`, the `evidence` block schema, `refs/`, `coverage.md` table format. |
| `reference/configuration.md` | All config knobs: bootstrap-captured values (adapters, `QA_ENVIRONMENTS`, `QA_TARGET_ENV`, `CONFIDENCE_MIN`, preview/branch mode), env vars (`PDD_NO_UPDATE_CHECK`), defaults. |
| `reference/cli.md` | The `pdd` CLI: install (`install-cli.sh`), `pdd` / `tui` / `board` / `board --watch` / `prune` / `check` / `update` / `init` / `adapt`, runtime (Node or Bun, no npm), what it reads. |

### Guides (task-oriented how-tos)
| File | Covers |
|---|---|
| `guides/refactor-legacy-monolith.md` | End-to-end: adopting PDD on an existing monolith you're refactoring in place. |
| `guides/port-to-new-language.md` | Porting/rewriting to a new language/runtime; reference = old system (the Bun→Node worked example generalized). |
| `guides/parallel-findings-worktrees.md` | Using the worktree option to work multiple findings in parallel without collisions; harness-specific base paths. |
| `guides/qa-environments.md` | Configuring the QA environment chain (dev/staging/prod), choosing `QA_TARGET_ENV`, running local vs per-env QA. |
| `guides/handling-rejected-qa.md` | What to do when QA rejects: follow-up finding on the same branch (pre-merge) vs a new finding (post-deploy). |
| `guides/monorepo.md` | Running PDD in a monorepo: scoping `.audit/`, per-package areas. |
| `guides/golden-master-adapters.md` | Writing golden-master adapters for `/audit-compare` (CLI / DB / API / browser); producing tier-2 diffs. |

### Install (tutorial-adjacent)
| File | Covers |
|---|---|
| `install/index.md` | Overview + the shell-installer one-liner; harness-agnostic explanation. |
| `install/claude-code.md` | Native plugin path (marketplace add + plugin install), CLI wrapper. |
| `install/other-agents.md` | Codex / Cursor / Copilot / Gemini native paths, `pdd adapt`, `--global`. |
| `install/air-gapped.md` | Offline/no-network install, manual SKILL.md fallback, `PDD_NO_UPDATE_CHECK`. |

> The existing root `QUICKSTART.md` remains the canonical hands-on tutorial; `docs/README.md`
> links to it. `install/*` expands and supersedes the terse root `INSTALL.md` (which stays as a
> stable entry point for "fetch and follow" agents).

### Governance (repo root — expected OSS files)
`CONTRIBUTING.md`, `DEVELOPMENT.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`.
Contributor Covenant for the CoC; DEVELOPMENT documents the `pdd` build (`esbuild`, `bun test`,
`dist/pdd.js`), the VHS demo regeneration, and the skills authoring conventions.

### README polish
Add a Table of Contents, a standalone **Philosophy** section (short, linking to
`docs/concepts/`), a **Learn more** pointer to `pdd.openvibes.tech/docs`, and keep the existing
content. Only `README.md` is touched by this task.

---

## Site pipeline (`pdd-site`)

Single coding task, must end with a passing `bun run build`.

1. Add this repo as a **git submodule** under `pdd-site` (e.g. `content/pdd`) so the build can
   read `docs/**/*.md`. Fallback if submodule is awkward on Cloudflare Pages: a `prebuild` sync
   script that copies `docs/` in.
2. Add deps: `react-markdown`, `remark-gfm`, `remark-frontmatter` (or `gray-matter`), and a
   syntax highlighter (`rehype-highlight` or `react-syntax-highlighter`) — all Vite-compatible.
3. Load markdown with `import.meta.glob('.../docs/**/*.md', { as: 'raw', eager: true })`, parse
   frontmatter, build `DocsNavGroup[]` dynamically (replacing the static `docsNav.ts`).
4. Route `/docs/:slug` renders the parsed body; `/docs` redirects to the first get-started page.
   Preserve the existing sidebar/drawer UX and styling; keep the en/pt UI toggle (doc bodies are
   English for now — do **not** block on translation).
5. Retire the hand-authored `sections/*.tsx` once parity with their content exists in markdown
   (their content is folded into the new markdown pages).

---

## Demos (VHS)

The existing `demo/pdd.tape` + `seed.sh` cover the dashboard. Additional `.tape` files may be
authored (e.g. `pdd board`, `board --watch`) following the same conventions. **Rendering is
verified by the human operator** (VHS needs ttyd/ffmpeg and real terminal output), not inside a
subagent. Not a blocker for the content or site waves.

---

## Wave decomposition

| Wave | Deliverable | Depends on |
|---|---|---|
| **1 — Content + governance** | All `docs/**/*.md` (concepts, reference, guides, install, index) + governance files + README polish | — |
| **2 — Site pipeline** | Markdown-driven `/docs` in `pdd-site`, build passing | Wave 1 frontmatter contract |
| **3 — Demos + review** | Extra VHS tapes, cross-doc coherence review | Waves 1–2 |
| **4 — Polish** | Portuguese translations of doc bodies, badges, final QA | Waves 1–3 |

This rollout executes Waves 1–2 (content in parallel + site pipeline) plus a coherence-review
pass, via a single agent workflow. Waves 3–4 tail follow.

## Excellence criteria (applies to every page)

- Accurate to the **actual** framework behavior — agents read the relevant `skills/*/SKILL.md`
  and README sections before writing; **no invented features**.
- Correct Diátaxis register (concepts explain *why*; guides are imperative step-by-step;
  reference is dry and exhaustive; no register bleed).
- GFM tables, fenced code with language tags, relative cross-links between pages, valid
  frontmatter.
- No placeholders / TODOs / "coming soon". Consistent terminology (finding, coverage, tier,
  parity, reference vs new system) matching the README.
- The inviolable rules restated wherever relevant: AI never authors commits; push/PR only after
  explicit human "yes"; merge is 100% human after target-env QA.
