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
- For immutable GitHub Releases, release assets are attached by the tag-driven draft release flow before publication, not by post-publication `release` events

## Runtime verification baseline

When runtime behavior is touched, verify:

1. local app/engine tests covering the changed path pass
2. no new high vulnerabilities are introduced (`npm audit --workspaces --audit-level=high`)
3. policy checks for supply chain/security gates pass

## Source-separation preflight and evidence

This is a prospective release procedure. Live execution may be inspected locally, but automated
evidence upload/retention and a release-blocking claim are disabled until ADR-0003's exact store,
access roles, TTL enforcement, deletion verification, and incident owner are accepted.

After those controls are accepted, repeat this procedure on every OS/architecture where the release
advertises YouTube source separation:

1. record exact commit, live base tip, lockfiles, OS, architecture, Python, Demucs, torch, and the
   exact locked yt-dlp version;
2. resolve sibling ffmpeg and ffprobe programs from one trusted package/build to absolute regular
   executables with exact platform-native names (`ffmpeg`/`ffprobe`, or their `.exe` forms), verify
   both full SHA-256 values, trusted package identity, and version outputs, then pass
   `BANDSCOPE_FFMPEG_PATH`, `BANDSCOPE_FFMPEG_SHA256`, `BANDSCOPE_FFPROBE_PATH`, and
   `BANDSCOPE_FFPROBE_SHA256`; the benchmark verifies all four before any fixture access, and a
   partial set, layout drift, name drift, or mismatch fails preflight; absolute paths are transient
   inputs, while future evidence retains only basenames, hashes, versions, trusted-package identity,
   and the sibling-layout result;
3. confirm content/platform authorization, record its non-sensitive governance reference, and do not
   provide cookies, credentials, login, paywall, DRM, geo, or anti-bot bypasses;
4. verify the htdemucs model's exact source, 84,141,911-byte size, and full SHA-256 from the
   supplemental inventory, then set `BANDSCOPE_HTDEMUCS_MODEL_PATH` to the exact absolute
   `955717e8-8726e21a.th` path; fail closed on a wrong filename, symlink, mismatch, or missing
   artifact; do not retain that local path, and require both the model-rights/legal record and the
   repository security owner's exact-hash approved-pickle risk record from ADR-0001;
5. authenticate the archive, extracted vocal member, and finished master by exact host, byte count,
   and full SHA-256; record the master duration and require deterministic Demucs `shifts=0`;
6. run the offline known-stem contract, then the sanitized live command template from
   `docs/engineering/youtube-known-stem-validation.md` on the unchanged candidate; retain the
   template ID/hash, never literal environment assignments or local paths;
7. if retention has been authorized, validate the schema-v1 `BenchmarkRun` artifact in
   `docs/TRD.md#benchmark-evidence-schema-v1`; every outcome has common provenance/stage/cleanup,
   while identity and score blocks exist only when those stages were reached;
8. verify the temporary media root is empty and no raw audio, archive content, full path, URL,
   cookie, credential, or provider response was retained.

The live lane needs a 20-minute operator timeout until calibration establishes a tighter limit. A
provider 5xx may receive one clean rerun only when current evidence supports transience. Otherwise
classify the first failing boundary and continue unrelated repository work; never convert failure to
skip/pass.

### Triage and rollback

- Integrity/member mismatch: quarantine/delete the cache or temp artifact and investigate source
  drift before another load.
- Correlation failure: treat as YouTube/reference fixture drift before diagnosing the model.
- Finite/shape/threshold failure: treat as separator correctness or model-version regression.
- Platform import failure: surface the supported local-file/fallback state; do not install an
  unreviewed wheel or model.
- Rollback removes release-blocking/live scheduling and restores the previous exact approved model;
  it does not restore the retired FFT profile or weaken intake/security tests.

The proposed initial TTL is 30 days, but it is not operative by this document alone. Governance must
accept the store, readers/writers, incident owner, TTL mechanism, and deletion verification before
the first artifact is uploaded. Raw media is never an evidence artifact.

## Incident handling note

If required workflows fail due to repository-controlled code/configuration, treat as `FAILED` and remediate in code. Use `BLOCKED` only for external permission/platform limitations.
