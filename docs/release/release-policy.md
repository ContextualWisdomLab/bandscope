# BandScope Release Policy

## Release source of truth

BandScope distributes release artifacts through GitHub Releases.

## Branch flow

- prepare releases on `release/*`
- merge reviewed release PRs into `main`
- keep `develop` in sync after release merges

## Required release artifacts

- desktop build artifacts
- checksums or equivalent integrity metadata
- release notes
- the latest SBOM
- supplemental inventory for bundled binaries and model artifacts

## Release rules

- release merges do not bypass review or required checks
- immutable releases are published from a tag-driven draft release after assets, checksums, SBOM, and supplemental inventory are attached
- release workflows must not attach assets after a GitHub Release is already published
- release artifacts must remain traceable to the GitHub Release record
- missing SBOM or missing supplemental inventory means the release baseline is incomplete

## Source-separation release evidence

- The deterministic known-stem contract is required for every change that touches YouTube intake,
  decode, separation, alignment, metrics, model delivery, or fixture metadata.
- Live known-stem evidence is advisory while ADR-0002 is Proposed. It becomes blocking only through
  a superseding/accepted ADR after authorization, full-hash pre-load model verification, calibrated
  thresholds, supported-platform evidence, and a stable bounded evidence artifact exist.
- A release must not advertise verified source-separation quality unless the exact integrated
  release candidate records a passing live production-path run. A skipped, provider-failed, stale,
  or predecessor-head result does not transfer.
- Release artifacts must identify the exact htdemucs signature/hash and whether weights are bundled,
  pre-provisioned, or runtime-fetched. Current policy permits runtime cache retrieval only; it does
  not authorize model-weight redistribution.
- Release rollback must preserve deterministic metric/security coverage and remove any invalid
  quality claim, scheduled live access, or unverified model artifact.
