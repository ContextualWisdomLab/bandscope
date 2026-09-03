# BandScope Supply Chain Design

## Context

- BandScope is a public GitHub-centered project with npm, uv-managed Python, Tauri/Rust, GitHub Actions, bundled binaries, and model artifacts.
- Supply-chain controls must be present in the bootstrap harness rather than added later.

## Constraints

- lockfiles are mandatory
- dependency review and audit must run in GitHub Actions; dependency review is supplied by the
  organization-level required workflow, while audit remains repository-owned
- SBOM generation must produce machine-readable output and survive in GitHub artifacts or releases
- bundled binaries and model artifacts must be tracked outside package-manager dependency graphs
- dependency review, audit, inventory, and SBOM checks must become required merge gates on both `develop` and `main`
- new direct dependencies require written admission rationale covering purpose, dependency class, alternatives, trust, license, security, transitive footprint, and release risk
- GitHub Actions references must stay SHA pinned; mutable refs are not an acceptable default
- Repo files define repository-owned workflows, the organization-level dependency-review
  authority, and intended check names; actual required-check enforcement still lives in GitHub
  branch protection or rulesets.

## Security Notes

### Attack surface

- dependency updates across JS, Python, Rust, and GitHub Actions
- bundled binaries and model files outside package-manager graphs
- release artifacts and GitHub release attachment paths

### Trust boundary

- GitHub workflows and release assets become part of the public supply chain
- lockfiles and workflow pins define the trust anchor for reproducible builds

### Mitigations

- require pinned repository workflow actions, committed lockfiles, documented organization-level
  dependency review, audit, SBOM generation, and supplemental inventory
- keep intended required checks visible in repo docs
- fail fast when lockfiles, workflows, or inventory files are missing

### Test points

- local harness checks must verify lockfiles, repository workflow presence, organization-level
  dependency-review authority, and action pinning
- GitHub workflows must run on develop, main, PR, and release-related events
- release workflows must retain SBOM artifacts and supplemental inventory
- bootstrap reporting must include the exact evidence set for workflow paths, required checks, Dependabot baseline, SBOM retention, and supplemental inventory

### Realistic threats

- workflow permission creep can turn build jobs into unintended release writers
- lockfile or inventory drift can make releases unverifiable even when CI is green

### Remaining risk

- ecosystem advisory coverage still lives outside repo control and can lag real compromise timelines

## Approaches considered

### 1. Minimal package-manager-only checks

- Pros: small setup
- Cons: ignores bundled binaries, model assets, and release traceability

### 2. GitHub-first supply-chain baseline

- Pros: fits public repository workflow, catches dependency drift early, supports release traceability
- Cons: needs multiple workflows and GitHub platform enforcement

### 3. Manual release checklist only

- Pros: low automation cost
- Cons: not enforceable, too easy to bypass, fails the baseline requirement

## Decision

- Choose the GitHub-first supply-chain baseline.
- Keep package-manager lockfiles, repository workflow pinning, the documented organization-level
  dependency-review authority, audit, SBOM generation, and supplemental inventory in the
  repository from bootstrap.
- Treat missing repo state as bootstrap work and treat platform-level branch protection or required checks as `BLOCKED` only when admin permission is unavailable.
- Treat missing repo-controlled supply-chain artifacts as `FAILED`, not as deferred follow-up work.
