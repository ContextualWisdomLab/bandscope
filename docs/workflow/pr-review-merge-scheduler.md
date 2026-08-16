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

The local repository may keep product CI, security, release, and build workflows. It must not restore
repo-local copies of `opencode-review.yml`, `pr-review-merge-scheduler.yml`, or their `scripts/ci` helper implementations.

Local developer OpenCode (`opencode.jsonc`) is a separate trust boundary from those central
review workflows. It uses NVIDIA NIM only, binds `{env:NVIDIA_API_KEY}` at
`https://integrate.api.nvidia.com/v1`, and must not restore GitHub Models, Copilot tokens, or
review-agent secrets. The organization secret name remains `NVIDIA_NIM_API_KEY`; CI maps that
secret onto `NVIDIA_API_KEY` for the OpenCode client.

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
- It does not require BandScope to carry repo-local OpenCode or scheduler workflow/helper copies.
- It does not move central token permissions into this repository.

## Security Notes

- Attack surface: organization required workflows with write access to PR comments, PR branch updates, and normal merges; local `opencode.jsonc` that calls NVIDIA NIM over HTTPS.
- Trust boundary touched: GitHub repository governance, PR review state, status checks, CodeRabbit review requests, and the local OpenCode provider allowlist (`nvidia-nim` + `{env:NVIDIA_API_KEY}`).
- Realistic threats: spammed review comments, merging a PR with unresolved conversations, merging without required checks, or hiding conflicts behind automation.
- Mitigations: central required workflow source pinning, idempotent per-head review comment marker,
  explicit unresolved-thread check, retry-bounded GitHub API reads, required-check verification
  through GitHub, conflict skip, guarded merge with `--match-head-commit`, and no admin bypass path.
- Remaining risk: CodeRabbit and GitHub check state can be delayed or stale; the scheduler therefore only advances eligible PRs and leaves code-fix work to agents or maintainers.
- Test points: organization ruleset inheritance, current-head OpenCode approval, unresolved review
  thread count, required-check rollup, approved behind PR, approved conflict-free PR, approved dirty PR,
  external failed-check classification, provider/runtime failure summary, Strix evidence lookup
  scope diagnostics, and local `opencode.jsonc` NIM-only contract (`small_model`, `{env:NVIDIA_API_KEY}`,
  no GitHub Models / Copilot leftovers).
