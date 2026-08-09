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

For a release candidate that claims YouTube source separation:

1. record exact commit, live base tip, lockfiles, OS, architecture, Python, Demucs, torch, yt-dlp,
   and `ffmpeg -version`;
2. confirm content/platform authorization and do not provide cookies, credentials, login, paywall,
   DRM, geo, or anti-bot bypasses;
3. verify the htdemucs model's exact source, 84,141,911-byte size, and full SHA-256 from the
   supplemental inventory before load; fail closed on cache symlink, mismatch, or missing artifact;
4. authenticate the archive, extracted vocal member, and finished master by exact host, byte count,
   and full SHA-256; record the master duration and require deterministic Demucs `shifts=0`;
5. run the offline known-stem contract, then the explicit live command from
   `docs/engineering/youtube-known-stem-validation.md` on the unchanged candidate;
6. retain bounded numeric/provenance evidence only: duration drift, identity correlation, composed
   lags, baseline/vocal SI-SDR, improvement, assignment margin, outcome code, and cleanup result;
7. verify the temporary media root is empty and no raw audio, archive content, full path, URL,
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

Evidence artifacts expire after 30 days unless release governance approves a different TTL. Raw
media is never an evidence artifact.

## Incident handling note

If required workflows fail due to repository-controlled code/configuration, treat as `FAILED` and remediate in code. Use `BLOCKED` only for external permission/platform limitations.
