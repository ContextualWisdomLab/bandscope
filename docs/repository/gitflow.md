# BandScope Gitflow

## Branch roles

- `develop`: repository default branch after bootstrap and the protected integration branch
- `main`: release branch, protected, `CodeRabbit` gate required
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
- every protected-branch merge requires the `CodeRabbit` gate and the required checks
- release and hotfix paths do not bypass dependency, security, SBOM, or release-preflight gates
