# BandScope Acceptance Criteria

## Purpose

This document defines repository-wide completion criteria for implementation, verification, PR handling, and operational readiness.

## Definition of done

A task is complete only when all of the following are true:

1. **Code correctness**: changes implement the intended behavior and include tests for regression-sensitive paths.
2. **Verification**: local verification commands pass for touched surfaces.
3. **Security and supply chain**: required security checks and dependency controls are preserved.
4. **PR continuity**: changes are attached to a canonical PR path (existing or newly created).
5. **Review handling**: actionable review findings are addressed with code or explicit rationale.
6. **Merge readiness**: required checks are green and branch is mergeable.
7. **Post-merge readiness**: when runtime/deploy is in scope, deployment evidence is present and validated.

## Required local verification baseline

Run the narrowest passing set that covers touched areas, and do not claim success without fresh output.

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm audit --workspaces --audit-level=high`

When CI/workflow files, supply-chain controls, or release/security docs are changed, also run:

- `python3 scripts/checks/verify_supply_chain.py`
- `python3 scripts/checks/security_gates.py`

When runtime-wide confidence is needed, run:

- `./scripts/harness/quickcheck.sh`

## Security notes requirement

Changes touching files, URLs, subprocesses, IPC, WebView, updates, model downloads, cache/export behavior, or workflow security controls must include `Security Notes` in the relevant PR/plan/documentation.

## CI acceptance baseline

For protected branches, intended checks are documented in `docs/security/github-required-checks.md`. Work should not reduce or bypass these checks.

## Source-separation quality gates

- Every separator or downloader change must keep all collected deterministic known-stem metric, alignment,
  archive-integrity, redirect/path, cleanup, and failure-contract cases passing.
- A live evidence claim must cross `download_youtube_audio()` and `AudioStemSeparator.separate()` on
  the same exact candidate, authenticate the separately pinned creator master, compose the two
  global offsets once, and record duration drift, master identity correlation, baseline/vocal
  SI-SDR, improvement, assignment margin, model identity, platform, and cleanup.
- The provisional live thresholds are YouTube/master duration drift ≤ 1.0 s, identity correlation ≥
  0.90, vocal SI-SDR improvement ≥ +0.5 dB, and vocal assignment margin ≥ 3.0 dB. The quality
  thresholds are supported by creator-master calibration only; an authorized YouTube baseline is
  required before promotion. Changing a threshold requires calibration evidence and an ADR; a
  provider or model failure does not justify weakening it.
- Skipped, disabled, HTTP/provider-failed, model-unavailable, integrity-failed, drifted, non-finite,
  predecessor-head, or stale-base execution is not passing evidence.
- Before the lane can block a release, ADR-0001/0002 blockers—content/platform authorization,
  full-hash pre-load verification, an explicit model-rights/legal delivery decision,
  exact-candidate pass, calibration, and supported-platform evidence—must be closed.

## Evidence policy

Completion claims must be backed by command output and/or GitHub run evidence from the current change set.
