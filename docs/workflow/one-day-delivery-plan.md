# One-Day Delivery Plan (Canonical)

## Purpose

Define the execution order used to close one canonical task end-to-end in this repository.

## Delivery sequence

1. Re-check current git/PR/issue/CI state.
2. Select one canonical highest-priority task based on user impact, security risk, failing gates, and merge dependency.
3. Implement minimal root-cause fix and required tests/docs.
4. Run local verification for touched surfaces.
5. Commit and push on a dedicated branch.
6. Attach to canonical PR continuity path (reuse or create PR).
7. Resolve actionable reviews (including CodeRabbit findings).
8. Re-verify required checks and mergeability.
9. Enable auto-merge when policy gates are satisfied.
10. After merge, verify downstream state (issues, follow-up PRs, deployment/runtime evidence when applicable).

## Prioritization rule

When multiple candidates compete, process in this order:

1. Security vulnerabilities and trust-boundary defects
2. Production breakage or deploy-blocking failures
3. Failing required CI/E2E gates
4. User-facing functional regressions
5. Non-blocking enhancement backlog

## PR continuity rule

- Prefer updating an existing relevant PR over creating duplicates.
- Use `pr_continuity` to identify canonical PR and duplicates.
- Keep changes small and directly tied to the selected canonical task.

## Completion policy

A task is not complete on docs/plans alone; it is complete only when code, verification, and PR/CI state all reflect closure.
