# BandScope Cross-Platform Build Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Windows and macOS build security gates to the GitHub harness and tie them to release artifact evidence.

**Architecture:** A dedicated GitHub Actions workflow runs real target-OS builds on Windows and macOS for PRs, pushes, tags, and releases. Artifacts and checksums are uploaded per OS, and required-check intent is kept in versioned docs.

**Tech Stack:** GitHub Actions, npm, uv, Rust stable toolchain, Python packaging sanity, zip artifacts, SHA-256 checksums.

## Security Notes

Cross-platform builds are supply-chain and release-integrity controls. The harness must fail if Windows or macOS coverage, artifact upload, checksum generation, or required-check intent drifts out of policy.

### Attack surface

- Windows and macOS packaging paths
- native dependencies and bundled binaries per OS
- release artifact generation and upload

### Trust boundary

- target-OS build workers in GitHub Actions act as release-path verifiers
- branch protections depend on named Windows and macOS build jobs

### Mitigations

- add dedicated Windows and macOS build jobs
- upload per-OS artifacts and checksums on PR, push, tag, and release events
- document required-check intent in repo docs and verify workflow coverage locally

### Test points

- local supply-chain verification covers workflow presence and trigger scope
- workflow uploads artifact and checksum for both OSes
- intended required checks include both OS build jobs

### Realistic threats

- platform-specific bundle assets can be missing even when the Rust shell compiles locally
- release upload credentials can be over-scoped if build and publish concerns share the same job

### Remaining risk

- notarization and signing remain outside the bootstrap harness until platform credentials exist

## Implementation tasks

---

### Task 1: Add cross-platform build policy docs

**Files:**
- Create: `docs/security/cross-platform-build-policy.md`
- Create: `docs/plans/2026-03-10-bandscope-cross-platform-build-design.md`
- Create: `docs/plans/2026-03-10-bandscope-cross-platform-build.md`

**Security Notes**

- Attack surface: build policy docs define how protected branches and releases are secured.
- Trust boundary: future CI and release behavior depends on these docs as a source of truth.
- Mitigations: keep explicit Windows/macOS gate names and release expectations in versioned docs.
- Test points: docs checks fail if policy docs disappear.

### Task 2: Add a dedicated Windows/macOS build workflow

**Files:**
- Create: `.github/workflows/build-baseline.yml`
- Create: `scripts/release/package_desktop_artifact.py`

**Security Notes**

- Attack surface: OS-specific build, packaging, and artifact upload paths.
- Trust boundary: GitHub runners produce public release-candidate artifacts.
- Mitigations: build on real target OSes, use lockfile-based installs, generate checksums, and upload artifacts per OS.
- Test points: workflow definitions cover PR, push, tag, and release events for both target OSes.

### Task 3: Wire docs and local checks to the new build policy

**Files:**
- Modify: `docs/security/dependency-policy.md`
- Modify: `docs/security/github-required-checks.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `ARCHITECTURE.md`
- Modify: `scripts/checks/verify_docs.py`
- Modify: `scripts/checks/verify_supply_chain.py`

**Security Notes**

- Attack surface: weak local checks allow drift before GitHub catches it.
- Trust boundary: docs and local checks shape what later contributors think is mandatory.
- Mitigations: enforce workflow existence, trigger coverage, and intended required-check names in the harness.
- Test points: quickcheck includes the updated supply-chain verification step.

### Task 4: Attempt GitHub enforcement evidence and report blockers honestly

**Files:**
- Modify: `SECURITY.md`

**Security Notes**

- Attack surface: false claims about required checks weaken merge safety.
- Trust boundary: GitHub branch protection lives outside the repo.
- Mitigations: collect evidence when possible, bootstrap missing repo state first, and only mark missing admin context as `BLOCKED`.
- Test points: final evidence names the workflow paths, intended checks, artifact locations, and blockers.
