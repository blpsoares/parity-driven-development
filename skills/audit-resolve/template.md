# Resolution — {{TITLE}}

**Finding**: [`./README.md`](./README.md) · [`./investigation.md`](./investigation.md)
**Resolved by**: {{AUTHOR}}
**Date**: {{DATE}}
**Worktree / Branch**: {{WORKTREE_OR_BRANCH}}

> Read first: [`.audit/BOOTSTRAP.md`](../../BOOTSTRAP.md), this finding's [`README.md`](./README.md) and [`investigation.md`](./investigation.md).

---

## 1. What was done

{{SUMMARY}}

<!--
3-5 sentences explaining the fix. In order:
- Which investigation hypothesis was confirmed
- Which change was applied
- Which part of the reference system motivated the change
-->

---

## 2. Modified files

{{MODIFIED_FILES}}

<!--
Table:

| File | Lines | What changed |
|---|---|---|
| src/services/order.ts | 80-95 | Fixes discount calculation to mirror the reference system |
| tests/order.test.ts | +12 | New regression test for the finding's case |
-->

---

## 3. Characterization test (golden master)

{{CHARACTERIZATION_TEST}}

<!--
- Test path: tests/audit/NNN_checkout.test.ts
- Reference case it pins: order #123
- What it asserts: the correct (reference) behavior, so future changes cannot regress it silently.
- If genuinely infeasible: state "none - <concrete reason>" and note that the tier was downgraded (a
  finding without a passing characterization test cannot be tier-3).
-->

---

## 4. Reference to the reference system

{{REFERENCE_SYSTEM}}

<!--
- File/spec used as the model: <path>:<line>
- Specific function/rule: <name>
- Quote the relevant snippet if it helps explain the decision
-->

---

## 5. Validations run

### 5.1 Static check
```
$ {{CHECK_CMD}}
{{CHECK_OUTPUT}}
```

### 5.2 Tests
```
$ {{TEST_CMD}}
{{TEST_OUTPUT}}
```

### 5.3 Parity with the reference system

**Reference case used**: {{REFERENCE_CASE}}

**Evidence in `./refs/`**:
{{PARITY_EVIDENCE}}

<!--
List the evidence files:
- refs/parity-reference.png — screenshot of the reference system post-fix (tier-1)
- refs/parity-new.png — screenshot of the new system post-fix (must be behaviorally identical) (tier-1)
- refs/parity-<date>.diff — data-to-data diff produced by /audit-compare (tier-2; empty diff = parity)
-->

**Comparison result**:

{{COMPARISON_RESULT}}

<!--
- [x] Correct value
- [x] Item count identical
- [x] Behaviorally equivalent
- or any criterion from README.md
-->

---

## 6. Evidence (machine-readable)

<!--
Consumed by /audit-pr and the `pdd` board. `confidence` MUST equal the achieved tier and be >= CONFIDENCE_MIN.
Tiers: tier-0 (text only) | tier-1 (paired screenshots) | tier-2 (automated diff) | tier-3 (tier-2 + passing characterization test).
-->

```yaml
evidence:
  confidence: {{CONFIDENCE_TIER}}
  parity_diff: {{PARITY_DIFF_PATH}}
  characterization_test: {{CHARACTERIZATION_TEST_PATH}}
  screenshots: [{{SCREENSHOT_PATHS}}]
  checks: { check: pass, test: pass }
  pr_url: <filled by /audit-pr>
```

---

## 7. Finding acceptance criteria

{{FINAL_CRITERIA}}

<!--
Copy Section 8 of README.md and check each item [x] with evidence.

Example:
- [x] Correct total (R$ X.XX -> R$ X.XX)
- [x] {{CHECK_CMD}} green
- [x] {{TEST_CMD}} green
- [x] Characterization test passing
- [x] Parity validated with reference case <ID> (tier-N)
-->

---

## 8. Remaining risks / notes

{{REMAINING_RISKS}}

<!--
- Possible regressions in untested scenarios
- Related areas that may need extra validation
- Technical debt introduced
-->

---

## 9. Suggested commit command (⚠️ dev runs it manually)

```bash
git add -A
git commit -m "{{COMMIT_MESSAGE}}

{{COMMIT_BODY}}"
```

> This fix was NOT committed automatically.
> PDD inviolable rule: commit/push is done ONLY by the human.
> Next step: run `/audit-compare NNN` (if not done) then `/audit-pr NNN` to open the evidence dossier.
