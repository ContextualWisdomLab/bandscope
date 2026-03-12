# BandScope Code Security Policy

## Public GitHub baseline

BandScope treats GitHub Code Security as part of bootstrap governance.

## Required controls

- CodeQL or equivalent code scanning workflow
- dependency review on pull requests
- security audit workflow for npm, Python, and Rust dependencies in scope
- Dependabot alerts and security updates
- secret scanning in GitHub plus a supplemental secret-scan gate workflow

## Enforcement

- `main` and `develop` must require the stable checks documented in `docs/repository/bootstrap-plan.md`
- Code Security controls must not be arbitrarily disabled or bypassed
- External AI-review status contexts may be requested but should not be the sole required status gate when the provider is operationally flaky.
- missing permissions to enable GitHub-native controls are `BLOCKED`, not justification to weaken the baseline
