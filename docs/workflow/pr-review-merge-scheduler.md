# PR Review Merge Scheduler

## Purpose

The PR review merge scheduler keeps the open `develop` PR queue moving without bypassing repository rules.
It runs hourly and can also be started manually from the `pr-review-merge-scheduler` workflow.

## Behavior

- Inspect up to 20 open, non-draft PRs targeting `develop` by default.
- Skip PRs with unresolved review threads.
- Request one CodeRabbit review per head SHA when a PR has zero unresolved threads but is not approved.
- Check only GitHub-required checks before merge actions.
- Retry transient GitHub CLI/API read failures and skip only the affected PR when review-thread
  state remains unavailable after retries.
- Update approved PRs that are behind `develop` and wait for fresh checks.
- Merge only PRs that are approved, thread-clean, conflict-free, and passing required checks.
- Fall back to GitHub auto-merge only when a direct normal merge does not complete.

## Non-Goals

- It does not generate code fixes.
- It does not dismiss reviews.
- It does not resolve review threads.
- It does not use admin merge or ruleset bypass.
- It does not weaken required checks, branch protection, or repository rulesets.

## Security Notes

- Attack surface: scheduled GitHub Actions automation with write access to PR comments, PR branch updates, and normal merges.
- Trust boundary touched: GitHub repository governance, PR review state, status checks, and CodeRabbit review requests.
- Realistic threats: spammed review comments, merging a PR with unresolved conversations, merging without required checks, or hiding conflicts behind automation.
- Mitigations: idempotent per-head review comment marker, explicit unresolved-thread check, retry-bounded GitHub API reads, required-check verification through GitHub, conflict skip, normal merge only, and no admin bypass path.
- Remaining risk: CodeRabbit and GitHub check state can be delayed or stale; the scheduler therefore only advances eligible PRs and leaves code-fix work to agents or maintainers.
- Test points: `workflow_dispatch` dry run on a limited `max_prs`, transient GitHub API failure, PR with unresolved thread, PR needing review, approved behind PR, approved conflict-free PR, and approved dirty PR.
