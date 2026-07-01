<!--
  PDD audit-pr — PR body template (EVIDENCE DOSSIER).
  Fill every {{PLACEHOLDER}} from the finding's README.md + investigation.md + resolution.md
  and the artifacts in refs/. Delete this comment and any section whose evidence genuinely
  does not exist (say so explicitly instead of leaving broken links). Keep the collapsed
  <details> blocks so the PR stays readable. Written in English on purpose (framework file).
-->

# audit/{{NNN}} — {{SHORT_TITLE}}

**Finding:** `{{NNN}}-{{SLUG}}` · **Area:** {{AREA}} · **Severity:** {{SEVERITY}}
**Reference case:** {{REFERENCE_CASE}} · **Reference system:** {{REFERENCE_NAME}}

## Summary (symptom → cause → fix)

- **Symptom:** {{SYMPTOM_ONE_LINER}}
- **Root cause:** {{ROOT_CAUSE_ONE_LINER}}
- **Fix:** {{FIX_ONE_LINER}}

{{SUMMARY_PARAGRAPH_3_TO_5_SENTENCES}}

## Confidence

**{{CONFIDENCE_TIER}}** — {{TIER_LABEL}}

<!-- tier-0 🔴 low (textual only) · tier-1 🟡 medium (paired screenshots) ·
     tier-2 🟠 high (automated data-to-data diff) · tier-3 🟢 max (tier-2 + passing characterization test) -->

Project minimum (`CONFIDENCE_MIN`): {{CONFIDENCE_MIN}} — **met**.

## Changes

{{FILES_CHANGED_LIST}}
<!-- e.g. - `path/to/file.ts:42` — <what changed and why> -->

Guided by reference: {{REFERENCE_SPEC_OR_FILE}}

## Automated checks

| Check | Command | Result |
|---|---|---|
| Static | `{{CHECK_CMD}}` | {{CHECK_RESULT}} |
| Tests | `{{TEST_CMD}}` | {{TEST_RESULT}} |

## Characterization test

{{CHARACTERIZATION_TEST}}
<!-- Path to the golden-master test that pins the reference behavior, e.g.
     `tests/audit/{{NNN}}_checkout.test.ts` — or the documented reason it is absent:
     `none - <reason the behavior could not be pinned>`. -->

## Parity evidence

<details>
<summary>Parity diff (data-to-data) — {{PARITY_DIFF_PATH}}</summary>

```diff
{{PARITY_DIFF_CONTENTS}}
```

</details>

Empty diff = parity confirmed objectively. If the diff is non-empty, the remaining deltas are explained
above under Summary/Changes.

### Paired screenshots (reference vs. new)

| Reference ({{REFERENCE_NAME}}) | New |
|---|---|
| {{SCREENSHOT_REFERENCE}} | {{SCREENSHOT_NEW}} |
<!-- Prefer gh-uploaded asset URLs so images render inline; otherwise relative markdown links to
     the committed assets. If no screenshots exist for this tier, replace this table with:
     "No paired screenshots — evidence is {{CONFIDENCE_TIER}} (see parity diff above)." -->

## Finding folder

Full dossier: [`{{FINDING_FOLDER_PATH}}`]({{FINDING_FOLDER_PATH}})
(README, investigation, resolution, and `refs/` artifacts.)

## QA checklist (validate on the branch/preview — merge gate)

**Where to test:** {{TESTABLE_LOCATION}}
<!-- per-branch-url: resolved {{PREVIEW_URL_PATTERN}} link ·
     local: `git fetch && git checkout audit/{{NNN}}-{{SLUG}}` then run the app -->

- [ ] {{QA_CHECK_1}}
- [ ] {{QA_CHECK_2}}
- [ ] {{QA_CHECK_3}}
- [ ] Behavior matches the reference system for case `{{REFERENCE_CASE}}`
- [ ] No regression in adjacent behaviors of {{AREA}}

---

> Opened via PDD `/audit-pr`. The AI did not author the commits and did not merge.
> Merge is human-only, after `/audit-qa {{NNN}}` approves this PR on the branch/preview.
