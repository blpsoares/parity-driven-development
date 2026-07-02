# BOOTSTRAP — Parity Audit (PDD)

> **⚠️ EVERY NEW CLAUDE SESSION MUST READ THIS FILE** before any audit work.
> Without this context, decisions are made with no references.
>
> {{RULES_DOC_REF}}
> <!-- If a project rules document exists, fill with:
>      "Complements (does not replace) the rules in [<path>](<path>) — read it too."
>      If none exists, remove this block. -->

---

## 1. Mission

{{MISSION}}

**Target date**: {{TARGET_DATE}}
**Production hard-launch**: {{HARD_LAUNCH_DATE}}

---

## 2. Reference system

**Name**: {{REFERENCE_NAME}}
**Type**: {{REFERENCE_TYPE}}
**Access**: {{REFERENCE_ACCESS}}

**Restrictions**:
{{REFERENCE_RESTRICTIONS}}

---

## 3. Build and test commands

| Command | Purpose |
|---|---|
| `{{CHECK_CMD}}` | Static verification (typecheck / lint / compile) |
| `{{TEST_CMD}}` | Test suite |
| {{OTHER_CMDS}} | {{OTHER_CMDS_DESC}} |

> Both must be green before any finding is considered resolved.

---

## 4. People and roles

{{PEOPLE_TABLE}}

**Final scope authority**: {{SCOPE_AUTHORITY}}

---

## 5. Repositories

{{REPOSITORIES_TABLE}}

<!-- Format:
| Repo | Local path | Role |
|---|---|---|
| new-system | /home/... | This project |
| reference-system | /home/... | Source of truth |
-->

**For other devs**: if paths vary per machine, use `find ~ -maxdepth 5 -type d -name <repo>` to locate them.

---

## 6. Project areas

Modules/screens/steps that may show up in findings. Used by `/audit-status` to group, by `/audit-new` to categorize, and to seed the coverage map (Section 15).

{{PROJECT_AREAS}}

<!-- One per line. Examples:
- login
- dashboard
- order form
- export-excel
- other
-->

---

## 7. Environments and URLs

{{ENVIRONMENTS_TABLE}}

<!-- Format:
| Environment | New system | Reference system | Notes |
|---|---|---|---|
| local | http://localhost:3000 | /local/path or URL | VPN? |
| staging | https://... | https://... | — |
| prod | https://... | https://... | — |
-->

**Operational rules**:
{{ENVIRONMENTS_NOTES}}

---

## 8. Databases

{{DATABASES_TABLE}}

<!-- Format:
| Database | Host/Name | Role | Status |
|---|---|---|---|
| main | host/db | prod/dev/staging | active |
| old | host/db | frozen dev | ⛔ do not use |
-->

**Where credentials live** (pointers — never values):
{{CREDENTIALS_POINTERS}}

> 🔒 NEVER write real credentials in this file.

---

## 9. Available MCPs

{{MCPS_TABLE}}

<!-- Format:
| MCP | Role | Notes |
|---|---|---|
| playwright | browser automation | manual login if OAuth |
| mssql | read-only queries | confirm target database before use |
-->

**Operational notes**:
{{MCPS_NOTES}}

---

## 10. Reference cases (validation answer key)

{{REFERENCE_CASES_TABLE}}

<!-- Format:
| ID (new) | ID (reference) | Why it qualifies | Areas covered |
|---|---|---|---|
| 12345 | 67890 | Scenario with X and Y | login, form |
-->

> Every parity validation MUST use one of these cases (or justify why it created a new one).

---

## 11. Preview / testable branch

QA validates on the branch/PR **before** the merge — QA is a merge gate. This section tells `/audit-qa` how to point a QA card at a testable environment.

**Preview mode**: {{PREVIEW_MODE}}
**Preview URL pattern**: {{PREVIEW_URL_PATTERN}}

<!-- PREVIEW_MODE is one of:
     - per-branch-url : there is a per-branch/per-PR deploy.
       PREVIEW_URL_PATTERN holds the template, e.g. https://pr-{N}.preview.app
       ({N} = PR number, {branch} = branch name — whichever the pattern uses).
     - local : no preview deploy. QA checks out the branch locally.
       PREVIEW_URL_PATTERN = none; /audit-qa emits local checkout instructions.
-->

---

## 12. Confidence thresholds

PDD scores every finding by evidence tier. `/audit-resolve` refuses to close a finding below `CONFIDENCE_MIN`.

**Minimum confidence to close a finding (`CONFIDENCE_MIN`)**: {{CONFIDENCE_MIN}}

**Evidence tiers** (fixed — do not change):

| Tier | Evidence | Label |
|---|---|---|
| tier-0 | textual description only | 🔴 low |
| tier-1 | paired screenshots (reference / new) | 🟡 medium |
| tier-2 | automated data-to-data diff (`/audit-compare`) | 🟠 high |
| tier-3 | tier-2 PLUS a passing characterization test | 🟢 max |

> Default `CONFIDENCE_MIN` = `tier-1`; recommended = `tier-2`.
> The tier is recorded in each finding's `confidence` frontmatter and in the
> `evidence` block of its `resolution.md`.

---

## 13. Notion integration (QA Board)

**Status**: {{NOTION_STATUS}}

<!-- ONE of:
     - Enabled — databases configured below
     - Disabled — /audit-qa runs with a file-based checklist
-->

{{NOTION_URLS_TABLE}}

<!-- When enabled:
| Database | URL | Database ID |
|---|---|---|
| PDD - Findings | https://notion.so/... | <id> |
| PDD - QA Tests | https://notion.so/... | <id> |
-->

**Expected structure** (fixed — do not change):

```
PDD - Findings
├── Name (title)                    human-readable finding title
└── Audit (select)                  technical ID (001-<slug>, 002-<slug>, ...)

PDD - QA Tests
├── Test (title)                    test case description
├── Finding (relation → Findings)   links the test to its parent finding page
└── Test Status (select)            "Awaiting test" | "Approved" | "Rejected"
```

> 🔒 These URLs are the source of truth for `/audit-qa`.

---

## 14. Inviolable rules

**From PDD (always, in every project)**:
- The AI **never authors commits** — it only suggests the command.
- Push is done **ONLY by the human**. Claude NEVER runs `git push`, not even with `--force`.
- `push` / `gh pr create` happen only after an explicit human "yes" in the same session.
- Merge is **human**, and only after QA approves.

**From the project**:
{{PROJECT_RULES}}

<!-- Rules extracted from the rules document (if any) + rules specific to this cycle -->

---

## 15. Parity coverage map

The live coverage map lives in **`.audit/coverage.md`** (a separate machine-readable file
parsed by `/audit-status` and the `pdd` CLI). It is seeded here at bootstrap.

**Table format** (exact columns):

```markdown
| Behavior / Area | Reference case | Status | Tier | Finding |
|---|---|---|---|---|
| checkout: total calculation | order #123 | verified | tier-3 | 007 |
| login: lock after 3 errors | test user | finding-open | tier-1 | 012 |
| export CSV | — | not-started | — | — |
```

- **Status**: `not-started` | `finding-open` | `resolved` | `verified`.
- Seeded by `/audit-bootstrap` from `PROJECT_AREAS` + `REFERENCE_CASES` (every row `not-started`).
- Updated by `/audit-new` (→ `finding-open`), `/audit-resolve` (→ `resolved`, fix done locally but NOT guaranteed), and `/audit-qa` (→ `verified`, only after QA approval **and** merge).
- **Coverage %** = `verified` rows / total rows (locally-`resolved` rows show as *pending QA*, not counted). Displayed by `/audit-status` and `pdd board`.

Seeded baseline for this project:

{{COVERAGE_BASELINE}}

<!-- One row per behavior/area from Sections 6 and 10, all in status not-started.
     This same table is written verbatim to .audit/coverage.md. -->

---

## 16. PDD workflow (fixed — do not edit)

### Lifecycle of a finding

```
1. Dev spots a divergence while observing the system.
2. Dev runs /audit-new <description>
   → structured interview (2 tracks: dev + Claude)
   → generates .audit/findings/NNN-<slug>/README.md (+ confidence, worktree) + refs/
   → sets the coverage.md row to finding-open
   → updates board.md
3. Dev or Claude runs /audit-investigate NNN
   → chooses approach A/B/C/D (static, dynamic, visual, combined)
   → runs the investigation
   → generates investigation.md in the same finding
4. Dev or Claude runs /audit-resolve NNN
   → implements the fix (respecting project rules), inside the finding's worktree if any
   → validates: {{CHECK_CMD}} + {{TEST_CMD}} + validation against the reference system
   → generates a MANDATORY characterization test (golden master)
   → enforces the confidence gate (>= CONFIDENCE_MIN) and writes the evidence block
   → creates branch audit/NNN — NEVER commits, NEVER pushes
   → sets the coverage.md row to verified (with the achieved tier)
5. (dev commits)
6. /audit-compare NNN → runs both systems, produces an objective parity diff (tier-2)
7. /audit-pr NNN → assembles the evidence dossier; pushes + opens the PR only after
   an explicit human "yes"; hands off to QA (PR open = testable)
8. /audit-qa NNN (only after the PR is OPEN, not merged):
   → creates the finding page + N QA test cards pointing at the branch/preview
   → all approved → "QA approved — you may merge PR #X" (merge stays human)
   → any rejected → new finding on the SAME branch (incremental fix before merge)
```

### Quality rules for every finding

- **Mandatory symptom**: an observable fact (number, error text, screenshot). Never "it's wrong".
- **Mandatory reproduction**: steps another dev (or Claude session) can follow alone.
- **Mandatory reference-system evidence**: screenshot, query result or output of the expected behavior.
- **Mandatory acceptance criterion**: a binary, testable condition (pass/fail).

### Where the files live

```
.audit/
├── BOOTSTRAP.md              ← this file
├── board.md                  ← lightweight kanban
├── coverage.md               ← parity coverage map (Section 15)
├── findings/NNN-<slug>/      ← open findings
│   ├── README.md             (+ confidence, worktree in frontmatter)
│   ├── investigation.md      (if /audit-investigate ran)
│   ├── resolution.md         (if /audit-resolve ran; + machine-readable evidence block)
│   └── refs/                 ← screenshots, exports, parity-<date>.diff
└── resolved/NNN-<slug>/      ← resolved findings (whole folder moves)
```

### How to start a new Claude session in this project

```
1. Read .audit/BOOTSTRAP.md (this file)
2. Read .audit/board.md for the current state
3. Read .audit/coverage.md for parity progress
4. If a project rules document exists, read it too
5. Read the specific finding in .audit/findings/NNN-<slug>/ if you are working on one
6. Start the work
```

---

**Bootstrap generated at**: {{GENERATION_DATE}}
**Generated by**: `/audit-bootstrap` (PDD method skill)
