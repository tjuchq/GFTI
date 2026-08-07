# Agent instructions

## Project context

Use the canonical vocabulary in `CONTEXT.md` and read relevant decisions in `docs/adr/`.

For architecture, assessment algorithms, testing, and deployment, follow the relevant documentation under `docs/`. Use `package.json` as the source of truth for commands.

`assessment.js` is the single production assessment implementation. Do not duplicate its formulas elsewhere.

## Work

If `docs/agents/issue-tracker.local.md` exists, follow it for issue and PR workflow. Treat it as local development configuration.

Keep `main` mirrored to `tjuchq/GFTI:main`, do daily development on `dev`, and whenever upstream changes, sync `main` first and then rebase `dev` onto it.

Before issue work, read the issue, comments, and blockers. Keep changes within the claimed scope and capture newly discovered work separately.

An algorithm baseline update represents approval of an intentional behavior change. Do not use it for refactors or merely to make a failing test pass.
