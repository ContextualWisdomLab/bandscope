# BandScope Supply Chain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dependency review, audit, SBOM, and supplemental supply-chain inventory controls to the bootstrap harness.

**Architecture:** The repo keeps supply-chain policy in docs, verification in local scripts, and execution in GitHub Actions. GitHub platform enforcement is documented and must be applied when repository admin context exists.

**Tech Stack:** npm workspaces, uv lock, Cargo lock, Dependabot, GitHub Actions, CycloneDX JSON SBOM, supplemental JSON inventory.

## Security Notes

Supply-chain workflows are part of the public attack surface. The harness must fail if lockfiles, workflow pinning, dependency review, audits, SBOM generation, or supplemental inventory drift out of policy.

### Attack surface

- dependency manifests and lockfiles
- GitHub Actions and third-party actions
- bundled binaries and model artifacts
- release assets and uploaded SBOMs

### Trust boundary

- package-manager graphs do not fully cover binaries and model artifacts
- GitHub workflows and release assets are externally visible supply-chain surfaces

### Mitigations

- commit lockfiles and pin workflow actions by SHA
- add dependency review, audit, and SBOM workflows
- keep supplemental component inventory in machine-readable form
- document intended required checks for develop and main

### Test points

- local supply-chain verification script
- quickcheck path includes supply-chain verification
- workflows trigger on develop, main, PR, tag, and release-related events

### Realistic threats

- over-broad workflow permissions can let PR-modified code affect release surfaces
- missing bundled-binary inventory can hide shipped assets outside package-manager graphs

### Remaining risk

- GitHub-native security signals still depend on repository settings and service availability outside repo control

---

### Task 1: Add supply-chain policy docs and inventory

**Files:**
- Create: `docs/security/dependency-policy.md`
- Create: `docs/security/github-required-checks.md`
- Create: `supply-chain/supplemental-component-inventory.json`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`

**Security Notes**

- Attack surface: dependency admission language and supply-chain inventory become future trust anchors.
- Trust boundary: PR and release docs shape what dependencies and bundled assets are allowed into public builds.
- Mitigations: keep rules versioned in repo docs and machine-readable inventory.
- Test points: local checks fail if docs or inventory go missing.

**Acceptance detail**

- document dependency admission rationale requirements in the PR template and policy docs
- document required checks for both `develop` and `main`, including inventory and SBOM gates

### Task 2: Add GitHub Actions workflows for dependency review, audit, and SBOM

**Files:**
- Create: `.github/dependabot.yml`
- Create: `.github/workflows/security-audit.yml`
- Create: `.github/workflows/sbom.yml`
- Modify: `.github/workflows/ci.yml`

Dependency review is supplied by the organization-level required workflow recorded in
`docs/workflow/github-bootstrap-execution-policy.md`; this repository intentionally does not
duplicate it as `.github/workflows/dependency-review.yml`.

**Security Notes**

- Attack surface: third-party actions, audit tooling, release uploads, and CI permissions.
- Trust boundary: GitHub Actions definitions become part of the supply-chain enforcement path.
- Mitigations: pin actions by SHA, use least-privilege permissions, and generate machine-readable SBOM artifacts.
- Test points: local checks verify repository workflow presence, organization-level
  dependency-review authority, trigger coverage, and action pinning.

**Acceptance detail**

- cover `pull_request` to `develop` and `main`
- cover `push` to `develop` and `main`
- cover release or version-tag execution for SBOM retention
- keep third-party actions SHA pinned

### Task 3: Add local verification for supply-chain baseline

**Files:**
- Create: `scripts/checks/verify_supply_chain.py`
- Modify: `package.json`
- Modify: `scripts/harness/quickcheck.sh`
- Modify: `scripts/checks/verify_docs.py`

**Security Notes**

- Attack surface: a weak local harness can let unsafe supply-chain drift land before PR review.
- Trust boundary: quickcheck is the first enforcement line before GitHub CI.
- Mitigations: fail fast on missing lockfiles, missing repository workflows, undocumented
  organization-level dependency-review authority, missing inventory, or unpinned actions.
- Test points: quickcheck output must include the supply-chain verification step.

**Acceptance detail**

- fail on missing lockfiles, missing repository workflows, undocumented organization-level
  dependency-review authority, missing supplemental inventory, or unpinned actions
- fail if required branch-check names drift from documented policy

### Task 4: Attempt GitHub enforcement and record blockers honestly

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `SECURITY.md`
- Modify: `ARCHITECTURE.md`

**Security Notes**

- Attack surface: false claims about branch protection or required checks create unsafe merge assumptions.
- Trust boundary: repository admin settings live outside the repo and cannot be inferred from local files alone.
- Mitigations: attempt GitHub evidence collection, bootstrap missing repo state first, and mark only missing admin context as `BLOCKED`.
- Test points: evidence should include actual workflow paths, intended check names, and explicit blocker details when enforcement cannot be applied.

**Acceptance detail**

- record the organization-level dependency-review authority and the exact repository workflow
  paths for audit and SBOM generation
- record the SBOM format and where Actions artifacts and Release assets are retained
- record how bundled binaries and model artifacts are tracked
- use `FAILED` for missing repo-controlled artifacts and `BLOCKED` only for missing GitHub permission or platform capability
