# BandScope Repository Governance

## Public repository baseline

BandScope is a public GitHub repository. GitHub is the source of truth for code, PR review, CI/CD, release distribution, Code Security, dependency review, SBOM retention, and repository governance evidence.

## Protected branches

- `develop` is the repository default branch after bootstrap
- `main` is the protected release branch
- `develop` is the protected integration branch
- both branches require PR-based merges, a passing `CodeRabbit` gate, conversation resolution, force-push prohibition, branch-deletion prohibition, and admin enforcement

## Review policy

- every merge into `main` or `develop` goes through a PR
- CODEOWNERS routes review to the right owners
- a passing `CodeRabbit` check substitutes for GitHub's built-in approving-review gate in this harness baseline
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
