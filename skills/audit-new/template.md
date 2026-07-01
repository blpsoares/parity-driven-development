---
id: "{{ID}}"
title: "{{TITLE}}"
slug: "{{SLUG}}"
area: "{{AREA}}"
severity: "{{SEVERITY}}"
status: "open"
discovered-at: "{{DISCOVERED_AT}}"
discovered-by: "{{DISCOVERED_BY}}"
confidence: "{{CONFIDENCE}}"
worktree: "{{WORKTREE}}"
---

> ## ⚠️ Mandatory context before touching this finding
>
> Read **in this order**:
> 1. [`.audit/BOOTSTRAP.md`](../../BOOTSTRAP.md) — operational context (URLs, commands, reference cases, thresholds)
> 2. The reference system (see Section 2 of BOOTSTRAP)
>
> Without this context your decisions will diverge from earlier ones.
>
> **Confidence:** `{{CONFIDENCE}}` (tier-0 text-only 🔴 · tier-1 paired screenshots 🟡 · tier-2 automated diff 🟠 · tier-3 diff + passing characterization test 🟢)
> **Worktree:** `{{WORKTREE}}` (an absolute path → work this finding inside it · `none` → main checkout, branch created at /audit-resolve)

---

# {{TITLE}}

## 1. Observed symptom (in the new system)

{{SYMPTOM}}

## 2. Expected behavior (in the reference system)

{{EXPECTED_BEHAVIOR}}

## 3. How to reproduce

{{REPRODUCTION_STEPS}}

**Reference case**: {{REFERENCE_CASE}}

## 4. Likely files involved

**New system**:
{{NEW_SYSTEM_FILES}}

**Reference system** — source of truth:
{{REFERENCE_SYSTEM_FILES}}

## 5. Cause hypothesis

{{HYPOTHESIS}}

## 6. Observations during reproduction

{{REPRODUCTION_OBSERVATIONS}}

## 7. Evidence (files in `./refs/`)

{{EVIDENCE_LIST}}

> Drop prints, query exports, screenshots of the reference system and the new system into `refs/`.
> Use descriptive names (`reference-orders-screen.png`, `new-orders-screen.png`, `query-result.txt`).
> Paired reference-vs-new screenshots raise this finding to `tier-1`; an automated diff from `/audit-compare` reaches `tier-2`.

## 8. Acceptance criteria

The finding is considered **resolved** when:

{{ACCEPTANCE_CRITERIA}}

And additionally (PDD standard — do not remove):

- [ ] `{{CHECK_CMD}}` passes without errors
- [ ] `{{TEST_CMD}}` passes without errors
- [ ] Side-by-side comparison new system vs reference system done for this reference case
- [ ] Confidence tier reaches at least `CONFIDENCE_MIN` (see BOOTSTRAP)

---

## 9. This finding's flow

```
[x] created via /audit-new on {{DISCOVERED_AT}} (confidence: {{CONFIDENCE}})
[ ] investigated via /audit-investigate
[ ] resolved via /audit-resolve
[ ] moved to .audit/resolved/
```
