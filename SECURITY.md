# Security Policy

## Reporting a vulnerability

If you believe you have found a security issue in PDD, please report it
privately. **Do not open a public GitHub issue for sensitive reports.**

Preferred channel:

- Open a private security advisory on the repository:
  [github.com/blpsoares/parity-driven-development/security/advisories/new](https://github.com/blpsoares/parity-driven-development/security/advisories/new)

Alternatively, contact the maintainers directly through the repository's
GitHub profile ([@blpsoares](https://github.com/blpsoares)) rather than filing
a public issue.

Please include enough detail to reproduce the problem: affected file or
command, steps to trigger it, and the impact you observed. We will acknowledge
the report and work with you on a fix and coordinated disclosure.

## Scope and threat model

PDD is intentionally small in surface area, so please calibrate expectations:

- **It is a documentation/command framework.** The core is a set of plain
  markdown skills (`skills/*/SKILL.md`) and the `.audit/` method — files such
  as `BOOTSTRAP.md`, `findings/`, and `coverage.md` that live in your project.
- **The optional `pdd` CLI is a local, read-only dashboard.** It reads the
  `.audit/` files in your working tree and renders their state. It runs no
  server, exposes no network service, and handles no credentials or secrets.
- **No network services, no secrets handling.** PDD does not collect telemetry,
  make outbound calls of its own, or store authentication material.

Because of this, the realistic security surface is limited to local behavior:
the CLI parsing untrusted `.audit/` files, and the commands your agent runs on
your behalf inside your own repository.

## The main safety property: inviolable human gates

PDD's central safety guarantee is procedural, and it is enforced by the command
definitions themselves:

- The AI **never authors commits**.
- `push` and `gh pr create` happen **only after an explicit human "yes"** in the
  same session.
- **Merge is 100% human**, and only after QA approves.

If you find a way to make a PDD command bypass one of these gates — for example,
a skill that commits, pushes, or merges without the required human approval — we
consider that a security-relevant defect and would like to hear about it through
the private channel above.

## Supported versions

PDD is distributed as a plugin/framework installed per project. Security fixes
are applied to the latest version on the `main` branch; please update to the
newest release before reporting an issue you cannot reproduce there.
