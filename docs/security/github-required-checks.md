# BandScope GitHub Required Checks

## Intended required checks

These are the merge-gate status checks that should be required on protected branches.

### `develop`

- `CodeRabbit`
- `ci / build-and-test`
- `dependency-review`
- `security-audit`
- `CodeQL`
- `sbom`
- `release-preflight`
- `gate / build / windows`
- `gate / build / macos`

### `main`

- `CodeRabbit`
- `ci / build-and-test`
- `dependency-review`
- `security-audit`
- `CodeQL`
- `sbom`
- `release-preflight`
- `gate / build / windows`
- `gate / build / macos`

## GitHub settings baseline

These are required repository settings or GitHub security features, not branch status-check names.

- Dependabot alerts: required
- Dependabot security updates: required
- Dependency graph: required
- Dependency submission coverage: required where GitHub supports it for the repository setup
- Dependency review gate on PRs: required
- CodeRabbit review gate substitution: required

## Workflow-managed baseline

These controls are expressed by repo workflows and are expected to be connected as intended required checks or release evidence.

- `supply-chain-inventory`: supplemental validation baseline
- `gate / build / windows`: intended required check
- `gate / build / macos`: intended required check
- release-time SBOM artifact retention: required baseline
- release-time supplemental inventory retention: required baseline

## Release evidence baseline

- CycloneDX JSON SBOM must be uploaded as a GitHub Actions artifact
- CycloneDX JSON SBOM must be attached to the GitHub Release when the workflow runs on a Release event
- `supply-chain/supplemental-component-inventory.json` must be uploaded as a GitHub Actions artifact and attached to the GitHub Release on Release events
- packaged desktop artifacts and checksums should remain traceable from the same release record when the release workflow emits them

## Enforcement note

The files in this repository define the workflows and the intended check names.
Actual branch protection, required checks, and GitHub security feature activation must be enforced in the GitHub repository settings or rulesets with repository admin permissions.

Missing repository state should trigger GitHub bootstrap per `docs/workflow/github-bootstrap-execution-policy.md`.
Only missing admin permissions or platform capability should be reported as `BLOCKED`.
