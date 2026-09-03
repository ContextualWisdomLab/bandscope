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
- supplemental inventory for lock-managed auxiliary tools, operator-provided or bundled
  executables, and model artifacts

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
  a superseding/accepted ADR after authorization, full-hash pre-load model verification, an explicit
  model-rights/legal delivery decision, repository-security acceptance of the exact-checkpoint
  approved-pickle risk (or an approved non-pickle replacement), calibrated thresholds,
  platform-scoped evidence, and an authorized schema-v1 bounded evidence artifact exist.
- The approved-pickle record must name its security owner, exact model SHA-256, dependency lock,
  allowlist, exact-artifact smoke/mutation evidence, rollback, review date, and expiry/re-review
  trigger. It is independent of the model-rights/legal delivery decision.
- A release must not advertise verified source-separation quality unless the exact integrated
  release candidate records a passing live production-path run on every OS/architecture for which
  that release advertises the capability. A skipped, provider-failed, stale, predecessor-head, or
  different-platform result does not transfer; other artifacts must advertise and exercise the safe
  fallback.
- Release artifacts must identify the exact htdemucs signature/hash and whether weights are bundled
  or pre-provisioned. Runtime fetching is forbidden; current policy requires a verified
  pre-provisioned cache or exact `BANDSCOPE_HTDEMUCS_MODEL_PATH` and does not authorize model-weight
  redistribution.
- Live preflight must transiently verify sibling ffmpeg/ffprobe executables from one trusted
  package/build by exact platform-native name, absolute path, full SHA-256, and version output before
  fixture access. Retained evidence contains only their canonical basenames, hashes, version outputs,
  shared trusted-package identity, and sibling-layout result; it never contains local paths.
  Verifying ffmpeg alone is insufficient because yt-dlp may execute ffprobe during postprocessing.
- Evidence upload and retention remain disabled until governance accepts the exact store, access
  roles, TTL enforcement, deletion verification, and incident owner required by ADR-0003. Once
  enabled, artifacts must validate against `docs/TRD.md#benchmark-evidence-schema-v1`; the literal
  command environment and local executable/model paths remain forbidden.
- Release rollback must preserve deterministic metric/security coverage and remove any invalid
  quality claim, scheduled live access, or unverified model artifact.
