# BandScope Gitflow

## Branch roles

- `develop`: repository default branch after bootstrap and the protected integration branch
- `main`: release branch, protected by the canonical stable checks and review-equivalent policy
- `feature/*`: short-lived work branches targeting `develop`
- `release/*`: release preparation branches targeting `main`
- `hotfix/*`: urgent fixes targeting `main`, with follow-up sync back into `develop`

## Merge directions

- `feature/* -> develop`
- `release/* -> main`
- `hotfix/* -> main`
- after every `main` release merge, sync the result back into `develop`

## Rules

- protected branches do not accept direct pushes
- every protected-branch merge requires the stable checks, conversation resolution, and
  review-equivalent policy in `docs/security/github-required-checks.md`
- request CodeRabbit and address current actionable findings, but do not treat a stale,
  rate-limited, or status-only context as a completed review
- release and hotfix paths do not bypass dependency, security, SBOM, or release-preflight gates
