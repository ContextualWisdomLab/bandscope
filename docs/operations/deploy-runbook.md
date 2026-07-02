# Deploy and Runtime Verification Runbook

## Purpose

Define repository-level deployment and runtime verification expectations.

## Current model

BandScope currently relies on GitHub Actions CI/release workflows as deploy-quality evidence for desktop artifacts and supply-chain outputs.

## Required release/security evidence

- Successful required checks on PR/branch (`docs/security/github-required-checks.md`)
- SBOM artifact generation (`.github/workflows/sbom.yml`)
- Release preflight completion (`.github/workflows/release.yml`)
- Cross-platform build baseline completion (`.github/workflows/build-baseline.yml`)

## Runtime verification baseline

When runtime behavior is touched, verify:

1. local app/engine tests covering the changed path pass
2. no new high vulnerabilities are introduced (`npm audit --workspaces --audit-level=high`)
3. policy checks for supply chain/security gates pass

## Incident handling note

If required workflows fail due to repository-controlled code/configuration, treat as `FAILED` and remediate in code. Use `BLOCKED` only for external permission/platform limitations.
