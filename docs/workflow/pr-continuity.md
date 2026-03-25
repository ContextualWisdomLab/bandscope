# PR Continuity Policy

## Purpose

Ensure each change lands through a canonical PR path without duplicate or orphaned work.

## Canonical PR selection

1. Prefer PR whose head branch matches current working branch.
2. If none, choose the most directly related open PR by changed files and gate impact.
3. If multiple candidates remain, prioritize the PR blocking required checks or security posture.

## Operational steps

- Run `pr_continuity` before opening or updating PRs.
- Reuse existing PR when appropriate; avoid duplicate PRs for the same fix.
- If no suitable PR exists, create one focused PR and link relevant issue(s).

## Review and gate handling

- Address actionable review comments in follow-up commits.
- Re-run or wait for required checks.
- Enable auto-merge only when mergeable and required checks are satisfied.

## State re-check rule

Because PR/CI status is dynamic, re-check open PR state before every major transition:

- before commit/push finalization
- before PR creation/update
- before merge/auto-merge actions
