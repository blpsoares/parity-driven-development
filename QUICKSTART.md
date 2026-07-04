# PDD Quickstart — start on a project in 5 minutes

A hands-on walkthrough: from zero to your first verified finding. Run **one command at a time** —
each step is gated and refuses to advance on weak input, so the framework guides you.

> **Requirements:** the PDD *method* needs nothing (the commands are markdown). Only the optional
> `pdd` dashboard needs **Node or Bun** — no npm.

---

## 0 · Install (once per project)

> Run this from **the project you're refactoring/porting** — the target repo whose parity you'll
> track — not from a clone of PDD itself. `.audit/` and the agent command files get written there.

**Claude Code:**
```bash
/plugin marketplace add blpsoares/parity-driven-development
claude plugin install pdd@parity-driven-development --scope project
```

**Any other agent (Codex / Cursor / Copilot / Gemini):**
```bash
cd /path/to/your-target-project
curl -fsSL https://pdd.openvibes.tech/cli | bash -s -- <codex|cursor|copilot|gemini>
```

## 1 · `/audit-bootstrap` — set up (run once)

An interview. You answer: the **mission**, the **reference system** (the legacy / spec / previous
version — your "answer key"), the **check** and **test** commands, the project **areas**, a few
**reference cases**, the **QA environments**, the **minimum evidence tier**, and whether you use
Notion. It writes `.audit/` (context + coverage map + board). **Nothing else works without this.**

## 2 · `/audit-new "short description"` — capture a finding

You spotted a divergence. This forces an **observable fact** (it rejects "it's broken"; it wants
"shows 3 items, should show 5"). It asks whether to isolate the work in a **git worktree**. Produces
finding `001`.

## 3 · `/audit-investigate 001` — find the root cause

Read-only. It understands *why*, and doesn't touch code.

## 4 · `/audit-resolve 001` — fix it

It proposes a plan, **you approve**, then it implements the fix **plus a mandatory characterization
test** (a test that pins the reference behavior). It **never commits**. It won't close below your
minimum evidence tier.

## 5 · You commit

The human authors the commit (inviolable rule — the AI never commits).

## 6 · `/audit-compare 001` — objective parity

Runs the same operation on **both** systems and produces a data-to-data diff (tier-2 evidence).

## 7 · `/audit-qa 001 local` — QA on localhost, **before** the PR

Validate locally. Approving here **unblocks** `/audit-pr`.

## 8 · `/audit-pr 001` — the PR as an evidence dossier

Assembles the PR body (symptom → cause → fix, tier, check/test results, characterization test,
parity diff, screenshots, QA checklist). It **only pushes / opens the PR after your explicit "yes."**

## 9 · Deploy → `/audit-qa 001 staging` (or `prod`)

QA on the deployed target environment, **after** the PR.

## 10 · You merge → the area becomes `verified`

Coverage only turns **`verified` (guaranteed)** when the target-environment QA is approved **and** the
PR is merged. Local resolution alone never guarantees.

**Anytime:** `pdd` (live dashboard) or `/audit-status` (in-chat) to see where everything stands.

---

## Worked example — the framework validated on itself

PDD was proven end-to-end migrating a real backend from **Bun → Node.js**:

| Phase | What happened |
|---|---|
| bootstrap | seeded 10 areas; reference = the suite running under Bun |
| new | finding 001: "under Node the suite can't load — `bun:test` doesn't exist" (worktree created) |
| investigate | root cause: test-runner coupling → recommend vitest (drop-in) |
| resolve | wired vitest, migrated the target test → **ran under Node = 5 pass** + characterization test |
| compare | **Bun 5 pass / 0 fail  ==  Node 5 pass / 0 fail** → parity diff empty |
| qa local | approved → unblocked the PR |
| pr | dossier assembled, **stopped at the push gate** (nothing pushed) |
| merge | coverage → **verified** (10%) |

Every gate held: coverage only became `verified` after QA + merge, the push gate was respected, and
the AI never committed. See the [README](README.md) for the full method and the [Legend] tab of the
`pdd` dashboard for the same command reference in-terminal.
