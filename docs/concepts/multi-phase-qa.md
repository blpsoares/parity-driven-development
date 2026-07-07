---
title: "Multi-Phase QA"
description: "Why PDD splits QA into a pre-PR local gate and per-environment post-deploy rounds, and why only the target environment plus a human merge flips coverage to verified."
group: "concepts"
order: 5
slug: "multi-phase-qa"
---

# Multi-Phase QA

In PDD, "QA" is not a single sign-off at the end. It is a **chain of gates** that a finding
crosses at different moments and against different runtimes. A fix is validated **locally,
before it ever becomes a pull request**, and then again **on each deployed environment, after
the PR exists**. Each round writes its own status to the finding. Only the round that runs on
the *target environment* — combined with a human merge — is allowed to raise guaranteed parity
coverage.

This page explains *why* QA is structured this way. For the exact command surface see
[`/audit-qa` in the commands reference](../reference/commands.md); for the knobs that define
the chain see [configuration](../reference/configuration.md).

## The two kinds of QA round

QA in PDD happens in **phases**, and the phase decides *when* it runs, *where* it points, and
*what it unblocks*.

| Phase | Environment token | When it runs | Points at | What it gates |
|---|---|---|---|---|
| **Local QA** | `local` | **Before** the PR exists | localhost / the branch run locally | Blocking precondition of `/audit-pr` |
| **Environment QA** | `dev` / `staging` / `prod` / … | **After** the PR is open and deployed | that environment's deployed URL | Coverage promotion (only on the target env) |

The finding records each round separately in its `README.md` frontmatter as a `qa-<env>` key —
`qa-local: approved`, `qa-staging: approved`, `qa-prod: rejected`, and so on. Nothing is
overwritten; the history of every environment is visible at once.

## Why local QA comes *before* the PR

A pull request in PDD is not a request for review of unproven work — it is an **evidence
dossier** for a fix that already behaves correctly. Opening a PR that has never been exercised
by a human wastes reviewer attention and pollutes the environment chain with churn.

So `local QA` runs on **localhost, before the PR**. It is the pre-PR gate: a human runs the fix
branch locally, walks the acceptance scenarios, and approves. That approval is a **blocking
precondition** of `/audit-pr` — the PR-assembly command *refuses to push or open a PR* until
`qa-local` is approved. This keeps the golden rule intact: nothing is exposed as a PR, and
certainly nothing is pushed, until a human has seen the behavior and until that human has said
"yes" at the push gate itself.

Because local QA precedes any PR, the `/audit-qa NNN local` round does **not** require a PR to
exist. The other phases do.

## Why environment QA comes *after* the PR

Local parity is necessary but not sufficient. Configuration, data, build flags, and integrations
differ between a laptop and a deployed environment — the reference system's behavior has to be
reproduced *where the new system will actually run*. So each deployment environment gets its own
QA round, pointed at that environment's real URL, and it can only run once the PR is **open** and
the branch is deployed there.

`QA_ENVIRONMENTS` (captured during [`/audit-bootstrap`](../reference/commands.md)) is the
ordered chain a change flows through — for example `local, staging, prod` or
`local, dev, staging, prod`. Each entry after `local` is a deployment environment with its own
URL and, if needed, its own VPN/login/manual-setup notes. A rejection on any deployment
environment while the PR is still open is fixed **incrementally on the same branch**
`audit/NNN-<slug>` — not as a new post-merge cycle — so the fix lands in the open PR and is
re-tested before merge.

## The target environment and coverage promotion

Not every environment carries the same weight. One of them is the **guarantee** — the
environment whose approval, once merged, actually proves parity for real users. That is
`QA_TARGET_ENV`, chosen at bootstrap and **defaulting to the last entry** of `QA_ENVIRONMENTS`
(commonly `prod`).

Coverage promotion is the single most tightly gated transition in PDD. A finding's row in
`.audit/coverage.md` becomes **`verified`** *only* when **both** of these hold:

1. `qa-<QA_TARGET_ENV>` is **approved** (approval on staging alone, if `prod` is the target,
   does not count), **and**
2. the PR is **merged** (`gh pr view` reports `state == "MERGED"`).

If the target-env QA is approved but the PR is not yet merged, or if only a non-target
environment approved, the row stays `resolved` (pending) and `/audit-qa` reports exactly what is
still missing. This is the *only* place a row is allowed to reach `verified` — local resolution,
a passing characterization test, or a green non-target environment never promote on their own.
See the [coverage model](./coverage-model.md) for how this fits the
`not-started → finding-open → resolved → verified` lifecycle and why local work alone can never
guarantee parity.

## Why merge is 100% human

The final step — merging the PR — is **never** performed by the AI. Merge is the last
irreversible action in the chain, and PDD puts a human at the gate of every irreversible action.
The AI assembles the dossier, runs the comparisons, records QA status, and reports "you may
merge PR #X" — but it does not merge, does not push without an explicit human "yes" in the same
session, and never authors the commit. These are inviolable rules, and multi-phase QA is built
around them: the local gate exists so a human sees the behavior before the PR; the target-env
gate exists so a human validates it in production-like conditions; and the merge itself is left
entirely to the human, because promoting coverage to `verified` is a claim about real behavior
that only a person should be allowed to make.

## Putting it together

For one finding, the QA timeline looks like this:

1. `/audit-qa NNN local` → approve on localhost → **unblocks** `/audit-pr`.
2. `/audit-pr NNN` → assembles the dossier; pushes and opens the PR **only after the human says
   "yes"**.
3. Deploy the branch to each environment in `QA_ENVIRONMENTS`.
4. `/audit-qa NNN staging`, `/audit-qa NNN prod`, … → each writes its own `qa-<env>` status.
5. Target-env approved **and** a **human merges** → coverage row flips to `verified`.

Every phase is idempotent and state-aware: re-running `/audit-qa NNN <env>` inspects what
already exists and either creates the QA artifacts, reports current status, or handles rejection
feedback — so the same command is safe to run at any point in the chain.
