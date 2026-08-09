# BandScope Technical Requirements Document

Status: Active authority
Last updated: 2026-08-10

## System contract

BandScope is a local-first React/Tauri desktop application with a Rust validation/orchestration
boundary and a Python analysis subprocess. The stable product hierarchy is `song -> section ->
role`. Shared TypeScript contracts carry rehearsal results; raw media and separated arrays stay
inside the local analysis boundary.

This TRD defines the real known-stem validation slice. Detailed commands and fixture provenance are
in `docs/engineering/youtube-known-stem-validation.md`; decisions are in `docs/adr/README.md`; UML
and data-flow views are in `docs/architecture/diagrams.md`.

## Technical requirements

| ID | Requirement | Implementation or proof |
|---|---|---|
| TRD-KS-001 | Reuse the production downloader with strict HTTPS YouTube URL validation, playlist disabled, public access only, duration ≤ 900 seconds, and completed file ≤ 50 MiB. | `bandscope_analysis.youtube.download_youtube_audio` and unit tests. |
| TRD-KS-002 | Pin the source archive, extracted WAV, and creator master by exact HTTPS host, byte size, and full SHA-256. | `KnownStemFixture`, `download_verified_reference_stem`, and `download_verified_creator_master`. |
| TRD-KS-003 | Stream bounded downloads and one member only; never call `extractall()`. | Test-only fixture loader and hostile archive tests. |
| TRD-KS-004 | Decode YouTube mix, creator master, and vocal reference to mono 44.1 kHz; estimate YouTube-to-master and master-to-vocal global lags, compose them once, select one 12-second active window, and never align predicted stems separately. | `align_active_reference_window` and `align_known_stem_through_master`. |
| TRD-KS-005 | Produce finite, equal-length `vocals`, `bass`, `drums`, and `other` arrays through `AudioStemSeparator`. | Live assertion at production separator boundary. |
| TRD-KS-006 | Calculate zero-mean SI-SDR from hand-defined projection/residual arithmetic; reject non-finite, short, or silent input. | `zero_mean_si_sdr` offline tests. |
| TRD-KS-007 | Gate vocal SI-SDR improvement ≥ a provisional +0.5 dB and vocal assignment margin ≥ 3.0 dB. | Live assertions; creator-master calibration supports the sentinel, but an authorized YouTube baseline is required before promotion. |
| TRD-KS-008 | Reject candidate drift when YouTube/master duration differs by > 1.0 s or aligned identity correlation is < 0.90. | Pre-inference live assertions against the pinned finished master. |
| TRD-KS-009 | Run deterministic contract/security tests by default and require `BANDSCOPE_RUN_YOUTUBE_STEM_E2E=1` for live network/model execution. | Pytest marker and environment guard. |
| TRD-KS-010 | Clean every downloaded/scored artifact on success and failure. | Nested `TemporaryDirectory` plus postcondition. |
| TRD-KS-011 | Bind model identity to inventory and full SHA-256 before any restricted torch deserialization. | Inventory records htdemucs signature `955717e8`, 84,141,911 bytes, and SHA-256 `8726e21a…a8b4`; runtime verifies the same in-memory bytes, uses `weights_only=True` with the reviewed minimal global allowlist and strict model construction, serializes concurrent loads, and has no download or unrestricted-loader fallback. |

## Data and class contracts

| Type | Required fields | Lifetime |
|---|---|---|
| `KnownStemFixture` | YouTube URL/video ID; archive/member/master URLs, hosts, full SHA-256 values, byte sizes; decoded master duration; target stem | Version-controlled test metadata |
| `AlignedStemWindow` | mixture/reference arrays; single lag; reference start; correlation | Process memory only |
| `KnownStemBenchmarkWindow` | YouTube/master lag; master/vocal lag; composed mixture/reference window; identity correlation | Process memory only |
| Separation result | canonical stem arrays; sample rate; duration; role types; notes | Process memory and downstream local analysis |
| Benchmark evidence | commit, fixture IDs/hashes, model signature/hash, platform, timestamps, scores, outcome code | `planned`; bounded artifact, never raw audio |

No relational database exists for this capability. The logical artifact model in
`docs/architecture/diagrams.md` is authoritative; a database ERD would falsely imply persistence.

## Metric contract

For zero-mean estimate $\hat{s}$ and reference $s$:

$$
s_{target}=\frac{\langle \hat{s},s\rangle}{\|s\|^2}s,\qquad
\mathrm{SI\text{-}SDR}=10\log_{10}\frac{\|s_{target}\|^2}{\|\hat{s}-s_{target}\|^2}.
$$

Improvement subtracts the downloaded mixture's SI-SDR from the separated vocal's SI-SDR. The
assignment margin subtracts the best non-vocal stem score from the named vocal score. Expectations
are literal thresholds, not values recomputed by production helpers.

## Platform and resource matrix

| Platform | Dependency state | Live lane status |
|---|---|---|
| Linux x86_64 | Demucs/torch resolved; CPU inference supported | Supported for controlled evidence |
| Windows amd64/arm64 | Demucs dependency marker permits installation; release build must prove wheel/tool compatibility | Unproven |
| macOS arm64 | Demucs dependency marker permits installation | Unproven |
| macOS Intel | Demucs dependency marker excludes installation | Explicitly unavailable; product must surface safe fallback |

The scored excerpt is 12 seconds, mono PCM at 44.1 kHz, with a 13-second separator duration bound
and 10 MiB scored-file bound. No release latency ceiling is yet accepted; record wall time and peak
memory during calibration rather than inventing a target.

Production separation passes `shifts=0` to Demucs. This removes its random temporal augmentation so
the same audio, model, platform, and precision produce repeatable benchmark inputs and avoids a
global random-seed side effect in the test harness.

## Model delivery and supply chain

`AudioStemSeparator` accepts only Demucs 4.0.1 `htdemucs`, mapped to signature `955717e8` and exact
artifact `955717e8-8726e21a.th`. A trusted provisioning step must place it in the configured
user-scoped cache or provide that exact absolute file through
`BANDSCOPE_HTDEMUCS_MODEL_PATH`. Runtime rejects a missing, symlinked, non-regular, incorrectly
sized, wrongly named, or full-SHA-mismatched artifact before torch deserialization, reads it once,
and passes those same verified bytes to PyTorch's `weights_only=True` restricted loader. The exact
Demucs/NumPy/Fraction allowlist, strict model construction, and serialized one-time cache are guarded
by mutation tests; there is no `weights_only=False` fallback. It never calls the remote Demucs loader
or downloads a missing checkpoint. The model is not bundled; ADR-0001 keeps both the approved-pickle
risk acceptance and model-rights/legal delivery decision as release blockers for a commercial claim.
The pinned checkpoint's legacy `numpy.core.multiarray.scalar` pickle name remains the sole alias;
the callable is resolved through the locked NumPy 2.x `_core` compatibility path, and NumPy lock
changes require the exact-artifact load smoke because that runtime path is private.

`ffmpeg` and `ffprobe` are operator-provided siblings and yt-dlp is locked to `2026.7.4`. Ordinary
product use may resolve the media tools from `PATH`, but release/live evidence must pass both
absolute executable paths and both full SHA-256 values as one four-part identity. Preflight records
both paths, hashes, exact platform-native sibling names, version outputs, and shared trusted package
identity before any reference or YouTube access; none may be described as bundled unless packaging
and licensing change.

## Failure taxonomy

- `unsupported_url`, `restricted_content`, `duration_exceeded`, `size_exceeded`: production intake
  policy failures.
- `download_failed`, `download_error`, `file_not_found`: live media/provider/tool failures.
- `runtime_dependency_invalid`: configured ffmpeg/ffprobe identity set, layout, or hash failure.
- Reference byte/hash/member/redirect error: fixture integrity or SSRF boundary failure.
- YouTube/master duration drift above 1.0 s or identity correlation below 0.90: wrong or drifted
  candidate/transcode.
- Model import/provisioning/identity/load error: platform or supply-chain failure.
- Non-finite/shape/threshold error: separator correctness failure.

Explicit live invocation converts all of these to a failing test. A failure blocks only the evidence
lane; it does not authorize a bypass or stop unrelated repository work.

## Verification and evidence

Default verification runs every collected deterministic known-stem contract test and explicitly
excludes the live marker. A live run uses the exact
command in the operator guide. Evidence must include exact commit and dependency lock, model full
hash, fixture archive full hash, public video ID, OS/architecture, result code, correlation, baseline
SI-SDR, vocal SI-SDR, improvement, assignment margin, duration, and cleanup result. Raw audio,
archive contents, local paths, provider response bodies, cookies, and credentials are forbidden.

On 2026-08-09, commit `5a3648a11d9097b8da48bb4a3ccbd97986aec25b` passed a 13-test
pre-correction partial suite. It did not yet contain the creator-master authentication,
two-global-offset composition, or explicit root-suite live-marker exclusion cases that raised the
corrected suite to 16. Its explicit live attempt successfully validated the pinned reference archive but
failed at the production YouTube download boundary with HTTP 502 and produced no model score. This
is failure evidence, not a passing live benchmark.

A separate creator-master calibration on the same environment measured deterministic `shifts=0`
SI-SDR improvement of +1.752 dB and vocal assignment margin of +7.631 dB. The old dry-vocal/mix
correlation was only 0.016856, proving it was not a valid identity gate. These values justify only
the provisional +0.5/+3.0 sentinels and the separate master identity design; they are not an
authorized YouTube pass.

After the correction, the byte-identical implementation tree published on GitHub as exact commit
`6e937a34f9036d92e909db3ce8848a5c39dc8e3b` passed the full quickcheck. Its live retry
authenticated all three reference artifacts and the pre-provisioned model full hash, then failed
closed at production YouTube intake with HTTP 502 after 65.49 seconds. No identity or separation
score was emitted.

## Traceability

`docs/documentation-coverage-matrix.md` maps product requirements and ADRs to modules, tests, and
release controls. Any threshold, fixture, model, persistence, or automation-policy change must
update that matrix and the applicable ADR before merge.

Issue #770's complete real-audio acceptance program is tracked separately in
`docs/doctoring/real-audio-accuracy-acceptance.md`. This TRD implements only its known-vocal-stem
production-path slice.

## References

- Brad Sucks. (2004, May 3). *Making Me Nervous source*.
  https://www.bradsucks.net/news/archives/2004/05/03/making-me-nervous-source
- Le Roux, J., Wisdom, S., Erdogan, H., & Hershey, J. R. (2019). SDR—Half-baked or well
  done? In *ICASSP 2019—2019 IEEE International Conference on Acoustics, Speech and Signal
  Processing* (pp. 626–630). IEEE. https://doi.org/10.1109/ICASSP.2019.8683855
- National Institute of Standards and Technology. (2023). *Artificial intelligence risk
  management framework (AI RMF 1.0)* (NIST AI 100-1). https://doi.org/10.6028/NIST.AI.100-1
- Rouard, S., Stoller, D., & Défossez, A. (2023). Hybrid transformers for music source
  separation. In *ICASSP 2023—2023 IEEE International Conference on Acoustics, Speech and
  Signal Processing*. IEEE. https://arxiv.org/abs/2211.08553
- YouTube. (n.d.). *Terms of Service*. https://www.youtube.com/static?template=terms
