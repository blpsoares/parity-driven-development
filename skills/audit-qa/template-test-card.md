# {{TEST_TITLE}}

<!--
  Template for the body of a test card in the Notion "PDD - QA Tests" database,
  or one scenario block in the file checklist when Notion is off.
  One card = one specific test scenario.

  This QA is PRE-MERGE: cards point at the fix branch, never production/main.

  TEST_TITLE: a clear sentence of what this test verifies
    Good example: "Confirm that order 12345 shows R$ 7,103.47 with 5 items"
    Bad example: "Test 1", "Validate calculation", "Correct summary"
-->

## What this test verifies

{{OBJECTIVE}}

<!--
  1-2 sentences explaining what is being tested, from the user's point of view.

  Good example:
    "This test ensures that when confirming an order with 5 items from different categories,
    the system shows the correct total of R$ 7,103.47, identical to what the previous system
    showed."

  Bad example:
    "Validates calculateTotal with the data of order 12345."
-->

## Before you start (where to test — PRE-MERGE)

{{PREREQUISITES}}

<!--
  This test runs on the FIX BRANCH before merge, not on production/main.

  If PREVIEW_MODE=per-branch-url, list the preview URL and access:
    - Open the per-branch preview: https://pr-{{X}}.preview.app  (this is PR #{{X}}, the fix branch)
    - Access to the reference system (if a comparison is needed)
    - Reference case in the new system: ID 12345
    - Equivalent case in the reference system: ID 67890

  If PREVIEW_MODE=local, embed the "How to run this branch locally" block:
    ### How to run this branch locally
    1. Fetch and check out the fix branch:
       git fetch origin audit/NNN-<slug> && git checkout audit/NNN-<slug>
    2. Install dependencies if needed (see the project README).
    3. Start the app the way the dev documented in BOOTSTRAP.
    4. Test against this locally-running branch — not main, not production.
    5. When done, return to your previous branch with: git checkout -
-->

## How to test (step by step)

{{STEPS}}

<!--
  Numbered list of the EXACT steps QA should follow.
  Each step must be a concrete, clear action.

  Example:
    1. Open the preview for PR #{{X}} (or the locally-running branch) and log in.
    2. In the orders list, find and open order 12345.
    3. Wait for the details screen to open.
    4. Click the "Confirm" button in the bottom-right corner.
    5. Look at the summary shown before confirming.
    6. Note the number of items listed and the total.
-->

## What should happen (expected result)

{{EXPECTED_RESULT}}

<!--
  Clear description of the state QA should find at the end of the steps.
  Be specific: exact value, number of items, exact text when possible.

  Good example:
    - 5 items should appear in the summary.
    - The total should be exactly R$ 7,103.47.
    - Each item should show: name, quantity and unit price.
    - No error message should appear.

  Bad example:
    "Everything correct."
    "The value should match."
-->

## How to compare with the reference system (if applicable)

{{REFERENCE_COMPARISON}}

<!--
  Steps to run the same operation on the reference system and compare.
  Only include if the visual comparison makes sense for this test.

  Example:
    1. In another tab, open the reference system.
    2. Find the equivalent case (ID 67890).
    3. Reproduce the same steps.
    4. Check: same number of items (5), same total (R$ 7,103.47).
    5. If anything differs, note what diverged.
-->

## If the test fails

If the result didn't match what was expected:

1. Note precisely **what appeared** (numbers, texts, error messages).
2. Take screenshots of the fix-branch screen **and** the reference system (if a comparison is
   needed).
3. Mark this card as **Rejected** (Notion `Test Status`, or the `- [ ] Rejected` marker in the
   checklist file).
4. Add a comment describing:
   - What you saw differently
   - At which step the divergence appeared
   - Any useful context (browser, time, odd behavior)

The dev will get notified and fix it **on the same branch, before the PR is merged** — you'll
re-test the updated branch.

## QA notes

<!--
  QA writes findings/comments here (used by the file-checklist surface).
  In Notion, use the card comments instead. Do not delete existing notes.
-->

## Reference links

- **Original finding**: (see the "Finding" column of this page — leads to the full description)
- **Technical details**: [{{PATH_RESOLUTION}}]({{URL_GITHUB_RESOLUTION}})
- **Open PR under validation**: #{{X}} ({{PR_URL}}) — merge only after QA approves

---

*Card generated on {{CREATION_DATE}} by the `/audit-qa` skill. Finding: `{{NNN}}-{{SLUG}}`.
Branch under test: `audit/{{NNN}}-{{SLUG}}` (PRE-MERGE — merge stays human).*
