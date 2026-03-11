# Contributing to BandScope

BandScope is a public GitHub project. GitHub is the source of truth for code review, CI/CD, release delivery, code security, dependency review, and SBOM retention.

## Branch strategy

- `develop` is the repository default branch after bootstrap.
- `main` is the protected release branch.
- `develop` is the protected integration branch.
- `feature/*` branches target `develop`.
- `release/*` branches prepare a `develop -> main` release.
- `hotfix/*` branches target `main` and must not bypass review or required checks.

Read `docs/repository/gitflow.md` before opening a PR.

## Pull requests are mandatory

- direct push to `main` or `develop` is not allowed
- every protected-branch merge requires at least one approving review
- stale approvals are dismissed on new commits
- all review conversations must be resolved before merge
- required checks must stay green; do not bypass them

## Local development

### Node

```bash
npm install
```

### Python

```bash
uv sync --project services/analysis-engine --group dev
```

### Verification

```bash
./scripts/harness/quickcheck.sh
```

## Commit and PR expectations

- keep changes small and reviewable
- explain security impact, dependency impact, SBOM impact, and i18n impact in the PR template
- record dependency admission rationale for every new direct dependency
- keep workflows SHA pinned and lockfiles committed
- do not weaken branch protections, required checks, Code Security, or supply-chain controls

## Security reporting

Use the reporting guidance in `SECURITY.md`. Do not open public issues for unpatched security defects when private reporting is available.
