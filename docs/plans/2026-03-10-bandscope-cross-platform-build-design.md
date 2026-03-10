# BandScope Cross-Platform Build Design

## Context

- BandScope targets Windows and macOS for distribution.
- Existing CI verifies lint, tests, dependency review, audit, and SBOM, but it does not yet enforce both target-OS builds as merge gates.

## Constraints

- Windows and macOS builds are mandatory security controls, not optional smoke checks.
- The build path should validate frontend build, native shell build, Python engine packaging sanity, and artifact upload.
- Required-check intent must stay visible in repo docs even when GitHub branch protection enforcement is unavailable.

## Security Notes

### Attack surface

- platform-specific packaging differences
- native dependencies and bundled binaries per OS
- release artifact integrity and checksum handling

### Trust boundary

- GitHub Actions becomes the trust path for Windows and macOS release candidates
- protected-branch merges rely on OS build gates to catch platform-specific regressions

### Mitigations

- add a dedicated cross-platform build workflow with Windows and macOS jobs
- upload platform artifacts and checksums on every protected-branch build path
- document intended required checks for both branches

### Test points

- local supply-chain checks verify workflow presence and trigger coverage
- workflow definitions include `develop`, `main`, tag, and release coverage
- artifacts and checksum files are uploaded for both OS jobs

## Approaches considered

### 1. Keep only Linux verification plus optional macOS check
- Pros: cheaper CI
- Cons: misses Windows-specific release path and fails the mandatory policy

### 2. Dedicated Windows/macOS build workflow
- Pros: clear merge-gate names, cleaner release linkage, real target-OS coverage
- Cons: more CI cost

### 3. Release-only platform builds
- Pros: fewer CI minutes on PRs
- Cons: fails protected-branch security baseline and catches regressions too late

## Decision

- Choose a dedicated cross-platform build workflow with explicit Windows and macOS jobs.
- Keep the jobs required for both `develop` and `main` in the intended GitHub required-check baseline.
- Treat missing GitHub repo state as a bootstrap condition and only treat missing branch-protection permissions as `BLOCKED`.
