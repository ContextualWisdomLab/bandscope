# BandScope Bootstrap Plan

## Required execution order

1. Create the public GitHub repository with initial default branch `main`.
2. Push a one-time empty `README.md` commit directly to `main`.
3. Create `develop` from `main`.
4. Switch the repository default branch to `develop` after `develop` exists.
5. Apply phase-1 protection to `main` and `develop` without required checks yet.
6. Create `bootstrap/setup` from `develop`.
7. Add the bootstrap baseline files, workflows, templates, docs, i18n seed files, and app skeleton.
8. Open `bootstrap/setup -> develop` and assign a reviewer.
9. After merge, tighten protections by connecting required checks.
10. Open `develop -> main` as `release/bootstrap-initial`.

## Phase-1 protections

- direct push blocked
- PR required
- review-equivalent policy required; use the current authority in
  `docs/security/github-required-checks.md`
- conversation resolution required
- force push blocked
- branch deletion blocked
- admins included
- bypass list empty

## Phase-2 protections

After workflows exist, require these stable checks on `main` and `develop`:

- `ci / build-and-test`
- `dependency-review`
- `security-audit`
- `trivy-fs-scan`
- `CodeQL`
- `sbom`
- `release-preflight`
- `gate / build / windows`
- `gate / build / macos`

## Initial README exception

The empty `README.md` commit exists only to initialize the public repository before protections can be enforced. It is not a standing exception.

## Default branch declaration

After bootstrap creates `develop`, the repository default branch is `develop`. `main` remains the protected release branch.

## Review substitution rule

The original bootstrap assumed a hosted `CodeRabbit` status could replace GitHub's approving-review
gate. Current policy supersedes that assumption: request CodeRabbit, address current actionable
findings, and use the stable checks plus review-equivalent policy in
`docs/security/github-required-checks.md`. A stale, rate-limited, or status-only context is not a
completed review. Protected branches still require PRs and conversation resolution.

## Path note

The current harness uses `services/analysis-engine` as the effective analysis service root. That path is treated as the concrete implementation of the requested Python analysis baseline.

## Docs or Pages note

`docs-or-pages.yml` is intentionally omitted from the baseline because the repository does not yet publish end-user documentation. The omission is deliberate rather than deferred; if public docs hosting becomes required, add a dedicated workflow and update this plan.
