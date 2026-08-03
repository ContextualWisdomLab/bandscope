# Central PR Review And Merge Automation

## Purpose

BandScope does not keep repo-local copies of the OpenCode Review or PR Review Merge Scheduler workflows.
Those checks are supplied by the ContextualWisdomLab organization ruleset from `ContextualWisdomLab/.github`
as central required workflows.

The central scheduler keeps the open `develop` PR queue moving without bypassing repository rules.
It runs in the target repository context through the organization required workflow, so mechanical
update-branch, auto-merge, and merge actions are performed by the selected workflow mutation
credential, not by a maintainer's local `gh` session. The central scheduler may select
`PR_REVIEW_MERGE_TOKEN`, `OPENCODE_APPROVE_TOKEN`, an exchanged OpenCode GitHub App token, or the
workflow `GITHUB_TOKEN`, depending on which credential can perform the guarded repository mutation.

The local repository may keep product CI, security, release, build, and thin reusable-workflow caller
workflows. It must not restore repo-local copies of `opencode-review.yml`,
`pr-review-merge-scheduler.yml`, or their `scripts/ci` helper implementations.

## Hourly maintenance caller

`.github/workflows/hourly-pr-maintenance.yml` is a thin, source-pinned caller for the central
workflows. It runs at minute 17 of every hour and can also be dispatched manually.

The caller performs two ordered phases:

1. Call the central review-fix scheduler for open pull requests targeting `develop`, with a one-hour
   retry window and a bounded maximum of three autofix dispatches per cycle.
2. Call the central review-and-merge scheduler to request missing current-head reviews, refresh up to
   three outdated branches, enable normal auto-merge, and merge only after required checks and
   independent approval are satisfied.

The local workflow contains no review parser, code-fix agent, review dismissal, thread resolution,
branch-update implementation, or merge command. Reusable workflows cannot elevate the caller's
`GITHUB_TOKEN`, so the caller declares only the permission union required by the two reviewed central
workflows. Credentials remain in repository or organization secrets and are inherited without being
copied into BandScope.

Scheduled workflows execute from the repository default branch. Therefore, the hourly loop becomes
active only after this caller is reviewed and merged into `develop`.

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

- It does not generate code fixes locally.
- It does not dismiss reviews.
- It does not resolve review threads.
- It does not use admin merge or ruleset bypass.
- It does not weaken required checks, branch protection, or repository rulesets.
- It does not require BandScope to carry repo-local OpenCode or scheduler workflow/helper copies.
- It does not copy central credentials or central mutation implementations into this repository.

## Security Notes

- Attack surface: organization required workflows with write access to PR comments, PR branch updates, and normal merges.
- Trust boundary touched: GitHub repository governance, PR review state, status checks, inherited workflow secrets, and CodeRabbit review requests.
- Realistic threats: spammed review comments, merging a PR with unresolved conversations, merging without required checks, widening caller permissions, or hiding conflicts behind automation.
- Mitigations: full-length central reusable-workflow SHA pins, an exact hourly caller contract test,
  least-privilege permission union, idempotent per-head review comment marker, explicit unresolved-thread
  check, retry-bounded GitHub API reads, required-check verification through GitHub, conflict skip,
  guarded merge with `--match-head-commit`, and no admin bypass path.
- Remaining risk: CodeRabbit and GitHub check state can be delayed or stale; the scheduler therefore only advances eligible PRs and leaves code-fix work to agents or maintainers.
- Test points: hourly cron and manual dispatch, central workflow SHA pins, delegated permission union,
  organization ruleset inheritance, current-head OpenCode approval, unresolved review thread count,
  required-check rollup, approved behind PR, approved conflict-free PR, approved dirty PR, external
  failed-check classification, provider/runtime failure summary, and Strix evidence lookup scope
  diagnostics.
