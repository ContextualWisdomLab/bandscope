# BandScope Code Security Policy

## Public GitHub baseline

BandScope treats GitHub Code Security as part of bootstrap governance.

## Required controls

- organization-required CodeQL/code-quality evidence and multi-language SAST on pull requests
- organization-required Trivy filesystem and OSV vulnerability scans
- organization-required dependency review on pull requests
- repository security audit workflow for npm, Python, and Rust dependencies in scope
- Dependabot alerts and security updates
- secret scanning in GitHub plus the repository supplemental secret-scan gate workflow

The central Security Scan owns PR OSV, dependency-review, Trivy, and soft
Scorecard evidence. Central Gitleaks currently runs only for
`ContextualWisdomLab/.github`, so BandScope keeps `secret-scan-gate` on pull
requests. The repository `security-audit` also remains a pull-request check: its
native npm, pip, and Cargo audits and documented exception handling are not
fully replaced by the central scanners. Bandit, CodeQL, Scorecard, and Trivy
remain push/schedule/manual backstops only; central SAST and CodeQL evidence own
their pull-request paths.

## Enforcement

- `main` and `develop` must require the stable checks documented in `docs/repository/bootstrap-plan.md`
- Code Security controls must not be arbitrarily disabled or bypassed
- External AI-review status contexts may be requested but should not be the sole required status gate when the provider is operationally flaky.
- missing permissions to enable GitHub-native controls are `BLOCKED`, not justification to weaken the baseline
