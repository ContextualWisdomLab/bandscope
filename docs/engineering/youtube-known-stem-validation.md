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

Install the analysis-engine development dependencies. Resolve sibling ffmpeg and ffprobe programs
from one trusted package/build to absolute regular executables and obtain both full SHA-256 values;
`PATH` names alone are not sufficient for release/live preflight. The absolute paths are verified
only at execution time and are never retained. Provision the exact model file in the user-scoped
torch.hub checkpoints cache or pass its exact absolute path through
`BANDSCOPE_HTDEMUCS_MODEL_PATH` before running. The separator never downloads a missing model.

The exact current model artifact is Demucs 4.0.1 htdemucs signature `955717e8`, file
`955717e8-8726e21a.th`, 84,141,911 bytes, full SHA-256
`8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4`. It is pre-provisioned and
not bundled. BandScope rejects a missing, symlinked, non-regular, incorrectly sized, or full-SHA
mismatched provisioned file before deserializing the same verified bytes. ADR-0001 keeps the
separate model-rights/legal delivery decision and the repository security owner's exact-hash,
dependency-lock-scoped approved-pickle risk acceptance as release blockers. An approved non-pickle
replacement closes the latter without an exception.

Before enabling the test, the operator must confirm that the intended use is permitted by the
content rightsholder and the applicable YouTube terms. The creator's permission for the reference
source does not by itself grant permission for automated access to YouTube.

```bash
UV_CACHE_DIR=/tmp/bandscope-uv-cache \
BANDSCOPE_RUN_YOUTUBE_STEM_E2E=1 \
BANDSCOPE_FFMPEG_PATH=/absolute/trusted/path/to/ffmpeg \
BANDSCOPE_FFMPEG_SHA256=<64-lowercase-hex-digest> \
BANDSCOPE_FFPROBE_PATH=/absolute/trusted/path/to/ffprobe \
BANDSCOPE_FFPROBE_SHA256=<64-lowercase-hex-digest> \
BANDSCOPE_HTDEMUCS_MODEL_PATH=/absolute/trusted/path/to/955717e8-8726e21a.th \
uv run --project services/analysis-engine \
  pytest services/analysis-engine/tests/test_youtube_stem_e2e.py \
  -m youtube_stem_e2e -vv
```

This block is the sanitized command template `youtube-known-stem-v1`. Local paths and their literal
environment assignments are execution inputs, not evidence fields. A future schema-v1 artifact
retains the template ID/hash plus canonical tool basenames, hashes, versions, trusted-package
identity, and the verified sibling-layout flag. It never retains absolute executable/model paths or
the literal command invocation.

If YouTube access, either fixed reference asset, the verified `ffmpeg`/`ffprobe` executable set, or
model weights are unavailable, the opted-in test fails. It must not silently turn an unavailable or
changed fixture into a passing result.

The four media-runtime fields must identify exact platform-native sibling program names. Their
paths, execute permissions, and hashes are verified before the benchmark accesses either reference
asset. The model path must use the exact inventoried filename; the production loader then performs
its independent same-byte size and full-hash verification before deserialization. Only the sanitized
identities described above may enter retained evidence.

Automated evidence upload/retention is currently disabled. Enabling it requires ADR-0003 governance
to accept the store, access roles, TTL enforcement, deletion verification, and incident owner. Any
artifact must then validate against `docs/TRD.md#benchmark-evidence-schema-v1`; early failures retain
common provenance/stage/cleanup but omit identity or score blocks that were never measured.

## Platform and evidence status

- Linux x86_64: controlled CPU evidence supported.
- Windows amd64/arm64 and macOS arm64: dependency markers permit Demucs, but this benchmark has not
  recorded exact-platform passing evidence.
- macOS Intel: current dependency markers exclude Demucs; separation must fail safely and offer the
  product fallback.

A pass is scoped to the exact OS/architecture and unchanged release candidate. Source separation may
be advertised only on each platform/architecture with its own passing record; evidence does not
transfer to another release artifact.

On 2026-08-09, exact commit `5a3648a11d9097b8da48bb4a3ccbd97986aec25b` passed a 13-test
pre-correction partial suite. It lacked
`test_download_verified_creator_master_authenticates_exact_file`,
`test_align_known_stem_through_master_composes_two_global_offsets`, and
`test_required_root_suite_explicitly_excludes_live_youtube_marker`. An explicit live attempt
authenticated and extracted the pinned reference archive,
then failed in the production YouTube downloader with HTTP 502 before separation. It produced no
correlation or SI-SDR score and is recorded as failure evidence, not a live pass. See
`docs/documentation-coverage-matrix.md`.

The first corrected branch revision raised that suite to 16. The current requirement is to run every
collected offline case—its count may grow with regression coverage—plus explicit required-CI
exclusion of the live marker. A creator-master-only calibration produced the provisional scores
above without calling YouTube; it is calibration evidence, not exact-candidate success.

Historical evidence snapshot: the byte-identical implementation tree published on GitHub as commit
`6e937a34f9036d92e909db3ce8848a5c39dc8e3b` passed the full quickcheck. A clean live retry
authenticated the archive, extracted vocal, creator master, and pre-provisioned htdemucs full
SHA-256. Production YouTube intake again failed closed with `download_failed` after HTTP 502 in
65.49 seconds, before separation. It produced no identity correlation or SI-SDR score. This is
historical exact-commit failure evidence—not a live pass or current-head validation. PR #828 owns
current-head offline checks and hosted review evidence, which must be regenerated after each commit.

## Security Notes

### Attack surface

The opt-in test crosses three public HTTPS download boundaries, decodes untrusted audio/ZIP data,
writes temporary files, invokes yt-dlp with the verified sibling `ffmpeg` and `ffprobe` executables,
and loads the existing Demucs model.

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
- Decoder/model vulnerabilities and operator provisioning remain upstream supply-chain risks.

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
  DRM, or bot-evasion behavior. TLS validation stays enabled. yt-dlp uses the operating system's
  managed CA trust store when populated and otherwise retains its certifi-backed default.
- Release/live execution supplies sibling ffmpeg and ffprobe absolute regular executables plus both
  full SHA-256 values. A partial identity set, unexpected program name/directory, path drift, or
  digest mismatch fails before yt-dlp runs. Paths are transient verification inputs; future evidence
  retains only sanitized identities and never the local paths.
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

The model-weight redistribution/provisioning decision and exact-checkpoint approved-pickle risk
acceptance are not established, and no successful exact-candidate live score or matrix covering
every advertised platform has yet been retained. Evidence retention itself remains disabled pending
the accepted store/access/TTL/deletion policy. Full-SHA pre-load verification is implemented, but
these remaining items are explicit release blockers rather than undocumented assumptions.

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
