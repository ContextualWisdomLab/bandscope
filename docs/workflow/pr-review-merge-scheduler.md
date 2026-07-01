# Central PR Review And Merge Automation

## Purpose

BandScope does not keep repo-local copies of the OpenCode Review or PR Review Merge Scheduler workflows.
Those checks are supplied by the ContextualWisdomLab organization ruleset from `ContextualWisdomLab/.github`
as central required workflows.

The central scheduler keeps the open `develop` PR queue moving without bypassing repository rules.
It runs in the target repository context through the organization required workflow, so mechanical
update-branch, auto-merge, and merge actions are attributed to `github-actions[bot]`, not to the
OpenCode review token. `OPENCODE_APPROVE_TOKEN` is not part of the scheduler contract.

The local repository may keep product CI, security, release, and build workflows. It must not restore
repo-local copies of `opencode-review.yml` or `pr-review-merge-scheduler.yml`.

## Behavior

- Inspect non-draft PRs targeting the repository default branch, currently `develop`.
- Use central OpenCode Review for current-head evidence, CodeGraph-backed review, peer-check waits,
  review-agent status contexts, failed-check explanation, provider/runtime failures, OpenCode runtime
  evidence, and approval publication failures. Publication failures are automation evidence, not
  source-backed repository findings, and they must be summarized as OpenCode runtime evidence.
- Keep provider failure, external failed-check classification, and Strix evidence lookup diagnostics
  in the central workflow. Strix evidence lookup failures must mention missing Actions read access
  when that is the actual GitHub API scope problem.
- Skip PRs with unresolved review threads.
- Check only GitHub-required checks before merge actions.
- Update approved PRs that are behind `develop` and wait for fresh checks.
- Merge only PRs that are approved, thread-clean, conflict-free, and passing required checks.
- Fall back to GitHub auto-merge only when a direct normal merge does not complete.

## Non-Goals

- It does not generate code fixes.
- It does not dismiss reviews.
- It does not resolve review threads.
- It does not use admin merge or ruleset bypass.
- It does not weaken required checks, branch protection, or repository rulesets.
- It does not require BandScope to carry repo-local OpenCode or scheduler workflow copies.
- It does not move central token permissions into this repository.

## Security Notes

- Attack surface: organization required workflows with write access to PR comments, PR branch updates, and normal merges.
- Trust boundary touched: GitHub repository governance, PR review state, status checks, and CodeRabbit review requests.
- Realistic threats: spammed review comments, merging a PR with unresolved conversations, merging without required checks, or hiding conflicts behind automation.
- Mitigations: central required workflow source pinning, idempotent per-head review comment marker,
  explicit unresolved-thread check, retry-bounded GitHub API reads, required-check verification
  through GitHub, conflict skip, normal merge only, and no admin bypass path.
- Remaining risk: CodeRabbit and GitHub check state can be delayed or stale; the scheduler therefore only advances eligible PRs and leaves code-fix work to agents or maintainers.
- Test points: organization ruleset inheritance, current-head OpenCode approval, unresolved review
  thread count, required-check rollup, approved behind PR, approved conflict-free PR, approved dirty PR,
  external failed-check classification, provider/runtime failure summary, and Strix evidence lookup
  scope diagnostics.
