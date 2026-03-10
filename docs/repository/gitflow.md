# BandScope Gitflow

## Branch roles

- `main`: release branch, protected, review required
- `develop`: integration branch, protected, review required
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
- every protected-branch merge requires review and required checks
- release and hotfix paths do not bypass dependency, security, SBOM, or release-preflight gates
