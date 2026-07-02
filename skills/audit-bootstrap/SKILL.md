---
name: "audit-bootstrap"
description: "Structured interview that fills .audit/BOOTSTRAP.md — the operational context read by EVERY new Claude session before any PDD audit work. Runs once during project setup. Also seeds .audit/coverage.md, the parity coverage map."
argument-hint: "(optional) 'redo' to overwrite an existing bootstrap"
user-invocable: true
disable-model-invocation: true
---

## User Input

```text
$ARGUMENTS
```

## Interaction language

Interact with the dev in their working language — never force English on the user; the example phrases below are templates. The generated files (`BOOTSTRAP.md`, `coverage.md`) are written in English so the framework stays shareable, but everything you SAY to the dev during the interview follows the language of the conversation.

## Context

This command initializes the **PDD (Parity-Driven Development)** method — a methodology to audit parity between a new system (refactor, rewrite, port) and a reference system (legacy, original spec, previous system). The artifact it produces (`.audit/BOOTSTRAP.md`) is referenced by every other `/audit-*` command. It also seeds `.audit/coverage.md`, the machine-readable parity coverage map consumed by `/audit-status` and the `pdd` CLI.

## Outline

### 1. Initial checks

- Check whether `.audit/` exists. If it does NOT, run `mkdir -p .audit/findings .audit/resolved && touch .audit/findings/.gitkeep .audit/resolved/.gitkeep` and continue.
- Check whether `.audit/BOOTSTRAP.md` already exists:
  - If it exists AND `$ARGUMENTS` does NOT contain "redo": stop and tell the dev "BOOTSTRAP.md already exists. To overwrite, run `/audit-bootstrap redo`. To just view it, read the file directly."
  - If it exists AND `$ARGUMENTS` contains "redo": read the existing content as "previous answers" and use them as the default for each question.
- Check whether the project has a rules document (e.g. `.specify/memory/constitution.md`, `RULES.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`). If found, note the path — it will be referenced rather than duplicated.
- Load the template at `.claude/skills/audit-bootstrap/template.md` (or the plugin-local `skills/audit-bootstrap/template.md`).

## Activity tracking (live presence)

So the `pdd` dashboard can show what is running in real time (across parallel agents and worktrees), record a presence file when this skill STARTS and delete it when it FINISHES — including on early/abort exits.

**On start** (this skill has no finding id — use an empty finding value):

```bash
mkdir -p .audit/activity
printf '{"command":"audit-bootstrap","finding":"","worktree":"root","startedAt":"%s","agent":"%s","pid":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(git config user.name 2>/dev/null || whoami)" "$$" \
  > ".audit/activity/audit-bootstrap.json"
```

**On finish or abort** (always remove the same file):

```bash
rm -f ".audit/activity/audit-bootstrap.json"
```

### 2. Interview tone

- **Critical rule**: NEVER fill a field without an explicit answer from the dev. If the answer is vague or "I don't know", record literally `<pending — fill before any /audit-new>`.
- Present ONE section at a time. Do not run an endless sequence of questions — each section ends with "ok, noted. next section?" and waits for confirmation.
- When a project rules document already covers a topic, ask ONLY whether there is anything beyond what is written there. Do not repeat the information.

### 3. Interview sections (in this order)

**Section 1 — Mission and scope**
- In ONE sentence, what is the mission of this project? (e.g. "reimplement X in Y while keeping behavioral fidelity")
- What is the main target date? (ISO format YYYY-MM-DD, or "no fixed date")
- Is there a production hard-launch after that date? When?

**Section 2 — Reference system**

This is the most important section — it defines the "answer key" every finding will use.

- What is the **name** of the reference system? (e.g. "legacy PHP system", "API v1", "business spec")
- What is the **type**? (e.g. PHP application, external service, spreadsheet, spec/document, another running system)
- How to access it: is there a URL? local path? does it need VPN? special login? is an MCP available?
- Are there write restrictions? (e.g. "never modify the shared database", "read-only via MCP")
- Does the reference system use a database? Which one? How to access it?

**Section 3 — Build and test commands**

- What is the command to check the project (typecheck, lint, compile)? (e.g. `bun run check`, `npm run typecheck`)
  → Record as `CHECK_CMD`
- What is the command to run tests? (e.g. `bun run test`, `npm test`, `pytest`)
  → Record as `TEST_CMD`
- Must these commands be green before any fix is considered valid?
- Are there specific integration commands that should also run? Record them separately.

**Section 4 — People and roles**
- Who are the humans involved? For each: name, role (dev/QA/PO/etc), focus area.
- How many Claude instances will collaborate? Each paired with which human?
- Who has final authority to decide scope?

**Section 5 — Repositories and local paths**
- List the relevant repositories: name, local path (or how to clone), role in one sentence.
- Is the reference-system repository already cloned locally? What is the path?
- If other devs take part: how do they locate the repos? (standardize `find ~ -maxdepth 5 -type d -name <repo>` when paths vary)

**Section 6 — Project areas**

Define the modules, screens, steps or areas of the new system that may show up in findings. This list is used by `/audit-status` to group findings, by `/audit-new` to categorize, and — critically — to seed the coverage map in Section 15.

- List the project areas (e.g. "login", "dashboard", "export", "order form"). Free format — the dev decides.
- If the project is a wizard or has numbered steps, list the steps.
- "other" is an automatic catch-all area (no need to list it).

Record as `PROJECT_AREAS` — one item per line.

**Section 7 — Environments and URLs**
- For EACH relevant environment (local, staging, production), collect: URL of the new system, URL/access of the reference system.
- Does any environment require VPN, special login or manual setup? Document it.
- In local development: how to run it? default port?

**Section 8 — Databases**
- For each database: address/host, name, role (prod/dev/staging/frozen).
- 🔒 Credentials: do NOT ask for the credentials themselves. Ask WHERE they live (`.env` file, secret manager, vault). Record only the pointer.
- Are there databases that must NOT be used (outdated, frozen)? Record them with ⛔.

**Section 9 — Available MCPs**
- List the MCPs this session has access to. For each: name and role in one sentence.
- Pay special attention to: database MCP (which database by default?), browser MCP (does it work headless? does it need credentials?).

**Section 10 — Reference cases (validation answer key)**

"Reference cases" are concrete artifacts of the system that will serve as the answer key in findings — they can be orders, contracts, invoices, records, IDs, test users, etc. The name of the artifact depends on the project domain.

- Ask for AT LEAST 2-3 reference cases. For each: identifier in the new system, equivalent identifier in the reference system, why it serves as an answer key (e.g. "it has scenario X and Y"), project areas it covers.
- If the project has no concrete cases yet, record `<to be defined at the first /audit-new>` and warn that each finding will have to elect its own.

**Section 11 — QA environments & preview**

QA is multi-phase: **local** (on localhost, BEFORE the PR — it blocks `/audit-pr`) and per
**deployment environment** (dev/staging/prod, AFTER the PR/deploy). Capture the chain of
environments this project actually uses.

- Ask: **"Which environments does a change flow through, in order?"** Start with `local` and add the
  deploy environments the project has (e.g. `local, staging, prod` or `local, dev, staging, prod`).
  Record the ordered list as `QA_ENVIRONMENTS`.
- For **each deployment environment** (not `local`), ask for how QA reaches it: a URL, and any
  VPN/login/manual step. Record next to that environment. Reuse Section 7 answers if already given.
- Ask: **"Which environment's QA is the guarantee — the one that, once approved + merged, marks an
  area as truly verified?"** Default to the **last** environment in the chain (e.g. `prod`). Record as
  `QA_TARGET_ENV`. (Coverage `verified` requires `qa-<QA_TARGET_ENV>` approved AND the PR merged.)
- Preview for the pre-merge PR: ask **"Is there a per-branch or per-PR deploy?"** (yes/no).
  - If **yes**: record `PREVIEW_MODE = per-branch-url` and `PREVIEW_URL_PATTERN = <pattern>` (e.g.
    `https://pr-{N}.preview.app`; `{N}` = PR number, `{branch}` = branch name).
  - If **no**: record `PREVIEW_MODE = local` and `PREVIEW_URL_PATTERN = none` — QA checks out the branch.

Record `QA_ENVIRONMENTS` (ordered), `QA_TARGET_ENV`, `PREVIEW_MODE` (`per-branch-url` | `local`) and `PREVIEW_URL_PATTERN`.

**Section 12 — Confidence thresholds**

PDD scores every finding by evidence tier. `/audit-resolve` refuses to close a finding below the configured minimum.

Show the tiers:

```
tier-0  textual description only            🔴 low
tier-1  paired screenshots (reference/new)  🟡 medium
tier-2  automated data-to-data diff         🟠 high   (produced by /audit-compare)
tier-3  tier-2 PLUS a passing               🟢 max
        characterization test
```

- Ask: **"What is the minimum evidence tier required to close a finding?"** Offer the default: `tier-1` (recommended: `tier-2`).
- If the dev has no preference, record `tier-1`.

Record `CONFIDENCE_MIN` (default `tier-1`).

**Section 13 — Notion integration (QA Board)**

First ask: **"Will you use Notion to manage QA for this project?"** (yes/no).

- If **NO**: record "Disabled — `/audit-qa` runs with a file-based checklist instead." and move to Section 14.

- If **YES**, ask whether the 2 databases already exist:

```
PDD needs 2 Notion databases (fixed structure):

  1. "PDD - Findings"   — 1 page per resolved finding
     Columns:
       • Name (title)        — human-readable title
       • Audit (select)      — technical ID (e.g. 001-<slug>)

  2. "PDD - QA Tests"   — N pages per finding (1 per test case)
     Columns:
       • Test (title)                  — test case description
       • Finding (relation → DB1)      — links the test to its parent finding
       • Test Status (select)          — Awaiting test | Approved | Rejected

Do you prefer:
  (a) Paste the URLs of the 2 databases you already created
  (b) I create the 2 databases for you now, with this exact structure
```

- If **(a)**: ask for the 2 URLs separately. Validate they are Notion database URLs. Record both.

- If **(b)**:
  1. Ask: "Paste the URL of the parent page where I should create the 2 databases".
  2. Check whether the Notion MCP is available. If NOT: warn the dev and pause.
  3. If available: create DB1 ("PDD - Findings"), capture ID and URL. Create DB2 ("PDD - QA Tests") with a relation pointing to DB1. Report to the dev and ask for confirmation before recording.

- **Record in BOOTSTRAP.md** (Section 13 of the template) both URLs and IDs. Essential — `/audit-qa` reads from here.

**Section 14 — Inviolable rules**

- If a project rules document exists (found in the initial check): automatically extract the rules most relevant to PDD (human-only push, mandatory tests, code standards, database restrictions, etc.). Ask: "is there anything beyond what is written there, specific to this cycle?"
- If no document exists: ask for the project's hard rules (e.g. "never commit without a PR", "reference database is read-only", "every new function has a test").
- Record explicitly: **push is done ONLY by the human**, **the AI never authors commits**, and **merge is human, only after QA approves** — these are inviolable PDD rules regardless of the project.

**Section 15 — Coverage baseline (seed `.audit/coverage.md`)**

No new question here — this section derives from the answers already collected. It builds the initial parity coverage map.

- Build one row per behavior/area to be verified, drawing from `PROJECT_AREAS` (Section 6) and the `REFERENCE_CASES` (Section 10).
- Every row starts in status `not-started`, with empty Tier and Finding columns.
- If a reference case is known for an area, put its identifier in the "Reference case" column; otherwise leave `—`.
- Present the proposed table to the dev and ask "does this cover the behaviors you want to track? (add/remove any row?)" before writing.
- Write the result to `.audit/coverage.md` using the coverage table format documented in the template.

The coverage table has exactly these columns:

```markdown
| Behavior / Area | Reference case | Status | Tier | Finding |
|---|---|---|---|---|
```

Status is one of: `not-started` | `finding-open` | `resolved` | `verified`. Seed everything as `not-started`; `/audit-new` moves a row to `finding-open`, `/audit-resolve` moves it to `resolved` (fix done locally, NOT yet guaranteed), and `/audit-qa` promotes it to `verified` only after QA approval **and** merge. Coverage % counts `verified` only.

**Section 16 — PDD workflow**
- Nothing to ask — just copy from the template. It is a fixed part of the model.

### 4. Review and generation

- After the sections, show a condensed summary of EACH section (2-3 lines) and ask: "Can I generate BOOTSTRAP.md with these answers? (yes / edit Section X)".
- If the dev answers "edit Section X", go back to that section.
- On confirmation, generate `.audit/BOOTSTRAP.md` from the template, replacing the placeholders. Fields without an answer are filled with `<pending — fill before any /audit-new>`.
- Generate `.audit/coverage.md` from the Section 15 baseline (all rows `not-started`).
- Create the `.audit/board.md` skeleton if it does not exist.

### 5. Initial board (create if missing)

```markdown
# PDD Board — <project name>

> Update it BEFORE picking up a finding (mark [doing]) and AFTER resolving (move to resolved/).
> Context: see [BOOTSTRAP.md](./BOOTSTRAP.md)

## In progress
<empty>

## Available
<empty>

## Resolved (last 7 days)
<empty>
```

### 6. Closing

Report:
- Path of the generated BOOTSTRAP.md.
- Path of the generated coverage.md and how many rows it seeded.
- How many fields remained `<pending>` (if any, warn that they must be filled before `/audit-new`).
- Next step: "When you spot a divergence, run `/audit-new <short description>`."

Before returning, remove the presence file: `rm -f ".audit/activity/audit-bootstrap.json"` (also do this on any early/abort exit).

## Quality rules

- NEVER invent an answer by inference. If the dev says "I don't know", record it literally.
- NEVER write real credentials to a file (pointers only — where they live).
- ALWAYS reference an existing rules document instead of duplicating it.
- The AI never authors commits; push and merge are human. State this in the generated BOOTSTRAP.
- Final confirmation before writing to disk.
- The activity presence file (`.audit/activity/audit-bootstrap.json`) MUST be removed when the skill finishes or aborts.
