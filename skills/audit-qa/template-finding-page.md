# {{HUMAN_TITLE}}

<!--
  Template for the body of the Finding page in the Notion "PDD - Findings" database,
  or the header of the file checklist when Notion is off.
  Fill it in QA-friendly (non-technical) language.

  Rules:
  - Never use: function, endpoint, query, controller, repository, state
  - Always use: screen, button, field, value, list, form, table
  - Always name the screen and the interaction (e.g. "on the Orders screen, when clicking Save")
-->

## What this is about

{{ABOUT}}

<!--
  2-3 plain-language sentences explaining the problem that was fixed.
  QA needs the CONTEXT, not the code.

  Good example:
    "On the order summary screen, the total showed the wrong amount — it displayed only
    1 item even when the order had 5. That made the operator confirm the order with a value
    different from what would actually be charged."

  Bad example:
    "The calculateTotal function in the orders repository used DATEDIFF incorrectly instead
    of the correct stored procedure."
-->

## What was fixed

On the **{{SCREEN}}** screen, {{AFFECTED_INTERACTION}}:

- **Before**: {{BEFORE}}
- **Now**: {{NOW}}

<!--
  SCREEN: friendly name of the screen or area (e.g. "Order Summary", "Registration Form")
  AFFECTED_INTERACTION: where QA will see the change
    e.g. "when clicking Confirm", "when typing in the Discount field",
         "after adding items", "when exporting the report"
  BEFORE: the wrong behavior, described as the user perceived it
  NOW: the correct behavior
-->

## Why it matters

{{IMPACT}}

<!--
  1-2 sentences about the real operational impact.

  Good example:
    "Without this fix, the operator could confirm orders with amounts that differ from what
    will be charged, causing rework and complaints."

  Bad example (technical):
    "Fix of aggregation logic in the orders module."
-->

## Where to test (this is PRE-MERGE)

{{TESTABLE_ENVIRONMENT}}

<!--
  This QA happens BEFORE the PR is merged. QA validates the fix branch, never production/main.

  If PREVIEW_MODE=per-branch-url, put the per-branch preview URL here, e.g.:
    "Preview for PR #{{X}}: https://pr-{{X}}.preview.app  (this runs the fix branch only)"

  If PREVIEW_MODE=local, reference the local-branch-checkout instructions embedded in the
  test cards ("How to run this branch locally").
-->

## Reference data to test with

{{REFERENCE_CASES}}

<!--
  List of cases QA should use to reproduce.
  Format:
    - Case 12345 (new system) / 67890 (reference system) — scenario description

  If the finding defined no specific case, omit this section.
-->

## Reference links

- **Technical details of the fix** (for curious devs): [{{PATH_RESOLUTION}}]({{URL_GITHUB_RESOLUTION}})
- **Open PR under validation**: [{{PR_TITLE}}]({{PR_URL}}) — state: OPEN
- **Original finding**: [{{PATH_README}}]({{URL_GITHUB_README}})

<!--
  URL_GITHUB_* = absolute GitHub URL pointing at the file on branch audit/NNN
  PR_URL = URL of the OPEN pull request (QA is the merge gate — do not merge until QA approves)
-->

---

*Page generated automatically on {{CREATION_DATE}} by the `/audit-qa` skill.
If anything here is wrong, talk to {{RESPONSIBLE_DEV}}.*
