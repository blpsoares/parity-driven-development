# Investigation — {{TITLE}}

**Finding**: [`../README.md`](./README.md)
**Investigated by**: {{AUTHOR}}
**Date**: {{DATE}}
**Worktree**: {{WORKTREE}}  <!-- absolute path, or "none" -->
**Approach used**: {{APPROACH}} — {{APPROACH_JUSTIFICATION}}

> Read first: [`.audit/BOOTSTRAP.md`](../../BOOTSTRAP.md) and this finding's [`README.md`](./README.md).

---

## 1. Investigation execution

{{EXECUTION}}

<!--
If path A: compared code excerpts, with file:line (new system vs reference)
If path B: queries/calls run, captured results, diffs
If path C: references to the images in refs/, what was observed
If path D: each sub-phase separately
-->

---

## 2. Observed facts (confirmed)

{{FACTS}}

<!--
Numbered list of things that were ACTUALLY verified in this investigation.
Evidence + citation of file/query/screenshot.
Do not include assumptions here.
-->

---

## 3. Root-cause hypotheses (ranked)

{{HYPOTHESES}}

<!--
Format per hypothesis:

### Hypothesis H1 (probability: XX%)
**Description**: ...
**Supporting evidence**: ...
**Weakening evidence**: ...
**How to test**: ...

### Hypothesis H2 (probability: YY%)
...
-->

---

## 4. Recommendation

{{RECOMMENDATION}}

<!--
- Which hypothesis to attack first and why.
- The likely file and line to modify.
- The fix strategy in 2-4 sentences.
-->

---

## 5. Known risks of the fix

{{RISKS}}

<!--
- Possible regressions in other areas of the system.
- Tests that MUST be run (beyond the default).
- Reference cases that MUST be validated after the fix.
-->

---

## 6. Confidence

{{CONFIDENCE}}

<!--
Record the finding's confidence tier after this investigation, and why:
- tier-0 = textual description only
- tier-1 = paired reference-vs-new screenshots
- tier-2 = automated data-to-data diff (from /audit-compare)
- tier-3 = tier-2 plus a passing characterization test (added in /audit-resolve)
Only claim a tier the evidence actually supports. If raised, also update the README frontmatter.
-->

---

## 7. Out of scope? (fill in only if applicable)

{{OUT_OF_SCOPE}}

<!--
If the investigation revealed that the "bug" is actually:
- A data divergence between the dev database and production (not code)
- A pending feature, not a bug
- A known limitation of the reference system
Flag it here and justify. If flagged, /audit-resolve should NOT change code —
it should move the finding to resolved/ with a closing note.
-->
