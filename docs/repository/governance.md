# BandScope Repository Governance

## Public repository baseline

BandScope is a public GitHub repository. GitHub is the source of truth for code, PR review, CI/CD, release distribution, Code Security, dependency review, SBOM retention, and repository governance evidence.

## Protected branches

- `develop` is the repository default branch after bootstrap
- `main` is the protected release branch
- `develop` is the protected integration branch
- both branches require PR-based merges, the stable checks and review-equivalent policy in
  `docs/security/github-required-checks.md`, conversation resolution, force-push prohibition,
  branch-deletion prohibition, and admin enforcement

## Review policy

- every merge into `main` or `develop` goes through a PR
- CODEOWNERS routes review to the right owners
- CodeRabbit is the default requested AI review and its current actionable findings must be
  addressed; its hosted status context is not itself a stable required check because it can be
  stale or rate-limited
- a status-only success without a completed review is not review-equivalent evidence
- self-approval, direct push, and arbitrary rule weakening are out of policy

## No direct push policy

The only direct push exception is the one-time empty `README.md` bootstrap commit used to create `main` before protections exist. After that, protected branches stay PR-only.

## No arbitrary disable policy

The agent must not disable or weaken:

- required reviews
- required checks
- dependency review
- security audit
- CodeQL or code scanning
- SBOM generation or release retention
- secret scanning or supplemental secret gates

If GitHub permission is insufficient to enforce these settings, report `BLOCKED` rather than softening the baseline.

## Evidence expectations

Repository bootstrap reports must include repository URL, default branch, branch protection summary for `main` and `develop`, open bootstrap PR URLs, required checks, Code Security state, Dependabot state, SBOM state, and any remaining admin-only work.
