# YouTube Known-Stem Validation

## Purpose

BandScope has an opt-in benchmark that downloads a real YouTube mix through the production
`download_youtube_audio()` boundary, separates a 12-second active excerpt with the real CPU
`htdemucs` model, and compares the resulting vocal stem with a known vocal source.

The benchmark lives in `services/analysis-engine/tests/test_youtube_stem_e2e.py`. Product and
technical requirements are canonical in `docs/PRD.md` and `docs/TRD.md`; ADR-0001 through ADR-0003
record model, live-gate, and persistence decisions. Its signal,
alignment, archive-integrity, and failure-path tests run offline in the normal Python test suite.
The network/model case is marked `youtube_stem_e2e` and skipped unless explicitly enabled. It is
not a required pull-request or default CI check.

## Fixture provenance and scope

- Composition: *Making Me Nervous* by Brad Sucks.
- YouTube fixture: `https://www.youtube.com/watch?v=e4pIpWVbMKs` (video ID
  `e4pIpWVbMKs`).
- Creator source page: `https://www.bradsucks.net/news/archives/2004/05/03/making-me-nervous-source`.
- HTTPS source archive:
  `https://bradmedia.com/media/source/making_me_nervous-120bpm.zip`.
- Archive size: `31,055,394` bytes.
- Archive SHA-256:
  `473578daa0bcf022448a144c5df9111ddf11e5a90e77f3649254e7813ba4981d`.
- Exact reference member: `vocals.wav`, `25,603,092` uncompressed bytes, SHA-256
  `4c7bb41c3f8bda1471dfd214b84f1d3457af344feeba33f0b31982ed0d808afc`.
- Creator-hosted finished master: `01 Brad Sucks - Making Me Nervous.mp3` on the exact
  `static1.squarespace.com` HTTPS host, `4,941,627` bytes, SHA-256
  `fc7f7c2a0387e46885e5c133cbd6d14d7de4d48908b68f1135354df0a336cf1d`, decoded mono duration
  `155.945238` seconds at 44.1 kHz.
- Permission evidence: the creator-published archive readme grants broad reuse permission for the
  supplied source material. No source audio is redistributed in this repository.

This fixture provides a dry, loop-oriented full-length vocal source plus instrument loops, not four
rendered full-length canonical stems. Dry-vocal correlation cannot establish recording identity, so
the separately pinned finished master is used only for the YouTube identity check. The benchmark
therefore makes a quantitative claim only about vocal isolation. It separately checks that Demucs
still returns finite, equal-length
`vocals`/`bass`/`drums`/`other` arrays and that `vocals` is the best named match for the reference.

## Evaluation contract

1. Download the YouTube audio through the same Python downloader used by BandScope.
2. Fetch the source archive and finished master over verified HTTPS into pytest's private
   `tmp_path`.
3. Require exact hosts, byte counts, and full SHA-256 values for the archive, extracted vocal WAV,
   and finished master before accepting the references.
4. Load the YouTube mix, creator master, and vocal reference at mono 44.1 kHz.
5. Reject fixture drift when YouTube/master decoded duration differs by more than `1.0 s`.
6. Estimate a global YouTube-to-master lag and require aligned identity correlation ≥ `0.90`.
7. Estimate a separate global master-to-vocal lag, compose the two offsets once, and select the
   strongest 12-second vocal window. Predicted stems are never aligned independently.
8. Run real `htdemucs` separation with deterministic `shifts=0` on the selected mixture excerpt.
9. Provisionally require vocal SI-SDR improvement over the unseparated mixture of at least
   `+0.5 dB`.
10. Require the named vocal output to beat the best wrong stem by at least `3.0 dB` SI-SDR.

The metric is zero-mean scale-invariant signal-to-distortion ratio (SI-SDR). The improvement score
is `SI-SDR(separated vocal, reference) - SI-SDR(downloaded mix, reference)`, so the gate measures
whether separation improves over returning the transcoded YouTube mixture unchanged. Silent and
non-finite inputs fail instead of receiving an artificial finite score.

The +0.5/+3.0 dB values are provisional sentinels, not industry standards. On the pinned creator
master, deterministic `shifts=0` produced +1.752 dB SI-SDR improvement and +7.631 dB assignment
margin. The previous dry-vocal/mix correlation was only 0.016856, which is why it is no longer an
identity gate. An authorized YouTube run must calibrate the final release threshold; this offline
creator-master probe is not a live pass.

## Running the benchmark

Install the analysis-engine development dependencies and ensure `ffmpeg` is on `PATH`. The first
Demucs run may obtain model weights through Demucs unless they are already present in its cache.
Prefer a pre-provisioned, integrity-verified model cache for repeatable runs.

The exact current model artifact is Demucs 4.0.1 htdemucs signature `955717e8`, file
`955717e8-8726e21a.th`, 84,141,911 bytes, full SHA-256
`8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4`. It is runtime-fetched and
not bundled. Demucs currently enforces only the filename's eight-hex hash prefix before load;
ADR-0001 therefore treats BandScope-owned full-hash pre-load enforcement and a model-rights decision
as release blockers.

Before enabling the test, the operator must confirm that the intended use is permitted by the
content rightsholder and the applicable YouTube terms. The creator's permission for the reference
source does not by itself grant permission for automated access to YouTube.

```bash
UV_CACHE_DIR=/tmp/bandscope-uv-cache \
BANDSCOPE_RUN_YOUTUBE_STEM_E2E=1 \
uv run --project services/analysis-engine \
  pytest services/analysis-engine/tests/test_youtube_stem_e2e.py \
  -m youtube_stem_e2e -vv
```

If YouTube access, either fixed reference asset, `ffmpeg`, or model weights are unavailable, the
opted-in test fails. It must not silently turn an unavailable or changed fixture into a passing
result.

## Platform and evidence status

- Linux x86_64: controlled CPU evidence supported.
- Windows amd64/arm64 and macOS arm64: dependency markers permit Demucs, but this benchmark has not
  recorded exact-platform passing evidence.
- macOS Intel: current dependency markers exclude Demucs; separation must fail safely and offer the
  product fallback.

On 2026-08-09, exact commit `5a3648a11d9097b8da48bb4a3ccbd97986aec25b` passed all 13 then-current default
offline cases. An explicit live attempt authenticated and extracted the pinned reference archive,
then failed in the production YouTube downloader with HTTP 502 before separation. It produced no
correlation or SI-SDR score and is recorded as failure evidence, not a live pass. See
`docs/documentation-coverage-matrix.md`.

The corrected branch now has 16 offline known-stem contract cases, including exact extracted-member
hash, creator-master authentication, composed-offset recovery, and explicit required-CI exclusion of
the live marker. A creator-master-only calibration produced the provisional scores above without
calling YouTube; it is calibration evidence, not exact-candidate success.

The byte-identical implementation tree published on GitHub as exact commit
`6e937a34f9036d92e909db3ce8848a5c39dc8e3b` passed the full quickcheck. A clean live retry
authenticated the archive, extracted vocal, creator master, and pre-provisioned htdemucs full
SHA-256. Production YouTube intake again failed closed with `download_failed` after HTTP 502 in
65.49 seconds, before separation. It produced no identity correlation or SI-SDR score and remains
exact implementation-head failure evidence, not a live pass.

## Security Notes

### Attack surface

The opt-in test crosses three public HTTPS download boundaries, decodes untrusted audio/ZIP data,
writes temporary files, invokes the existing `ffmpeg` yt-dlp postprocessor, and loads the existing
Demucs model.

### Trust boundary

YouTube media, yt-dlp metadata, the public source archive, finished master, ZIP metadata, audio
decoder input, and model weights are outside the repository trust boundary. The pytest `tmp_path` is
the only permitted storage root for downloaded media and extracted references.

### Realistic threats

- Fixture replacement, redirect, truncation, or a ZIP bomb could substitute malicious or misleading
  decoder input.
- A changed YouTube transcode or different recording could make an unrelated signal look like a
  separator regression.
- Login cookies, geo/DRM bypasses, or automated CI execution could expand legal, privacy, and account
  risk.
- Decoder/model vulnerabilities and first-run model downloads remain upstream supply-chain risks.

### Mitigations

- The live case requires the distinct `BANDSCOPE_RUN_YOUTUBE_STEM_E2E=1` opt-in and is excluded from
  default CI.
- The initial reference URL and every redirect target must use HTTPS on the exact allowlisted host;
  redirect targets are validated before their follow-up request. TLS verification is never
  disabled.
- The source archive is bounded by exact size and SHA-256; extraction accepts one exact target
  member, rejects a missing/duplicate/encrypted target, enforces its exact uncompressed size and
  full SHA-256, and ignores every non-target entry. It never calls `extractall()`. The finished
  master is independently pinned by exact host, byte count, and full SHA-256.
- The production YouTube downloader keeps its standard-URL allowlist, duration/size bounds,
  `noplaylist`, and no-geo-bypass policy. This test adds no cookies, credentials, login, paywall,
  DRM, or bot-evasion behavior. TLS validation stays enabled while yt-dlp uses the operating
  system's managed CA trust store rather than a separate certifi-only bundle.
- Alignment is global and bounded. Duration and creator-master identity correlation distinguish
  fixture drift from model quality failure; the two lags are composed once and model outputs are not
  optimized after separation. Demucs random shift augmentation is disabled with `shifts=0`.
- Raw audio and full paths are not logged or committed. A nested temporary directory explicitly
  deletes the reference, YouTube media, and scored WAV on both success and failure. Numeric scores
  and stable public fixture IDs are sufficient diagnostics.

### Test points

Offline tests cover SI-SDR behavior, invalid/silent signals, delayed/composed-window recovery,
archive/member/master authentication, ignored non-target/path-traversal entries, hash mismatch,
pre-request redirect rejection, member-size drift, deterministic Demucs invocation, and required-CI
marker exclusion. The live case covers the production downloader, real decoding, real Demucs output
shape/finiteness, SI-SDR improvement, and fixed-name assignment.

### Remaining risk

YouTube availability and transcoding are mutable, the informal source-pack permission is not legal
advice, and the test does not establish platform authorization. Upstream media decoders and Demucs
weights remain separate trust decisions. The fixture has only one full-length known canonical stem,
so the test cannot claim quantitative four-stem accuracy.

The model-weight redistribution license is not established, current Demucs verification uses only a
hash prefix, and no successful exact-candidate live score or supported-platform matrix has yet been
retained. These remain explicit release blockers rather than undocumented assumptions.

## References

- Brad Sucks. (2004, May 3). *Making Me Nervous source*.
  https://www.bradsucks.net/news/archives/2004/05/03/making-me-nervous-source
- Le Roux, J., Wisdom, S., Erdogan, H., & Hershey, J. R. (2019). SDR—Half-baked or well done? In
  *ICASSP 2019—2019 IEEE International Conference on Acoustics, Speech and Signal Processing*
  (pp. 626–630). IEEE. https://doi.org/10.1109/ICASSP.2019.8683855
- YouTube. (n.d.). *Terms of Service*. https://www.youtube.com/static?template=terms
- Rouard, S., Stoller, D., & Défossez, A. (2023). Hybrid transformers for music source
  separation. In *ICASSP 2023—2023 IEEE International Conference on Acoustics, Speech and
  Signal Processing*. IEEE. https://arxiv.org/abs/2211.08553
