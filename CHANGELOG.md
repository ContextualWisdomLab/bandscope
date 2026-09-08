# Changelog

## [Unreleased]

### Added

- Name tonight's first playable range on the ready rehearsal map and tell the player to check that span on their instrument before the section.
- Display the analyzed song tempo (BPM) as a badge in the rehearsal workspace.
- 각 합주 역할(Role)별 개인 연습 진행도를 0~100% 범위로 기록 및 시각화할 수 있는 연습 진척도(`practiceProgress`) 트래커 기능 추가. UI 컨트롤(슬라이더 및 +/- 버튼)과 한/영 다국어 지원 포함.

### Fixed

- Enforce one canonical local-audio resource policy across native local-file/YouTube bootstrap intake, the desktop bridge, Python request preflight, temporal decoding, and stem separation so oversized, overlong, malformed, wrong-rate, or non-finite input fails before bootstrap storage or expensive analysis/model work.
- Commit an admitted local source through a platform-specific no-clobber durability barrier before returning path-free project authority: Unix synchronizes the project directory after hard-link publication/stage removal, while Windows uses no-replace `MoveFileExW` with `MOVEFILE_WRITE_THROUGH`.
- Preflight source-container duration, sample rate, and channel count from the already-open audio handle before temporal, stem, or bass-transcription decoders resample, downmix, or truncate it; successful metadata probes rewind the handle and malformed probes fail closed.
- Advance the local-audio resource policy to v2 and bind the admitted canonical decoded mono buffer to the production float32 representation: 158,760,000 bytes for the existing 39,690,000-sample / 15-minute ceiling, preventing a wider floating buffer from silently consuming twice the intended canonical artifact memory while keeping the same sample count.
- Advance the local-audio resource policy to v3 and require the PCM artifact admitted to MIR to be native NumPy `float32`; noncanonical artifacts passed directly to policy validation fail closed with `decoded_dtype_unsupported`, while decoder-returned floating arrays are normalized only after their sample count and already-allocated bytes fit the shared policy.
- Pin the canonical local-audio decoder to explicit NumPy `float32` output and `soxr_hq` band-limited resampling instead of inheriting librosa defaults, so dependency-default changes cannot silently change the selected decode dtype or resampler; numerical output still requires versioned dependency and real-audio reproducibility evidence.
- Reject an oversized or over-budget decoder-returned array before float32 normalization can allocate a second canonical PCM buffer; decoder/resampler allocations made internally before `librosa.load` returns remain outside the artifact ceiling and require separate peak-RSS measurement.
- Detach an admitted non-owning decoder view into an owned canonical float32 PCM buffer before MIR handoff, so a returned artifact cannot retain a larger hidden NumPy backing allocation; decoder-internal transient memory remains part of the separate peak-RSS acceptance boundary.
- Map host allocator exhaustion during an otherwise policy-admitted canonical float32 copy to the stable payload-free `memory_budget_exceeded` rejection instead of surfacing a raw `MemoryError`; this preserves failure semantics without claiming that end-to-end peak RSS is bounded.
- Bound canonical PCM finiteness validation to 1 MiB temporary boolean-mask chunks instead of allocating a full-song NumPy mask, while preserving NaN and positive/negative infinity rejection.
- Keep native analysis cancellation job-scoped without exposing PIDs or generic process authority to the renderer, serialize accepted cancellation against terminal publication, and on Linux/macOS establish the Python engine as leader of a dedicated process group before `exec` so cancellation, timeout, and runner-error cleanup can signal the inherited group before reaping the direct child. Windows remains direct-child-only until the race-free Job Object boundary is implemented; real-audio cancellation latency, handle/temp cleanup, and peak-resource acceptance remain separate work.
- Put the timed YouTube import helper in a dedicated Linux/macOS process group before spawning `bandscope_analysis.youtube`; timeout and wait-error cleanup now terminate ordinary yt-dlp/FFmpeg descendants that retain the group before stdout/stderr readers are joined. Windows descendants and processes that deliberately leave the Unix group remain outside this claim.
- Terminate residual Linux/macOS same-group descendants after the directly owned import process reports terminal status and before stdout/stderr reader joins, so a successful parent cannot hang indefinitely behind an inherited pipe held by an outliving helper process.
- Bound captured stdout and stderr from BandScope-owned helper processes to 1 MiB per stream plus one overflow probe, failing closed before YouTube metadata parsing instead of allowing a buggy or hostile helper to grow parent-side output buffers without limit; this is a capture-memory bound, not a whole-process RSS/VRAM claim.
- Terminate the owned helper boundary as soon as the process-control loop observes stdout/stderr admission failure, so a helper that has already exceeded the 1 MiB stream ceiling cannot simply consume the remainder of the product timeout after its output reader has failed closed.
- Removed the compatibility module's stale unbounded helper-output implementation, leaving the bounded `process_output` module as the single execution owner while preserving the public crate-root API.
- Clamp helper-process polling sleeps to the monotonic time remaining before the configured deadline, so a coarse caller poll interval cannot extend a timed analysis/import helper by another full interval; this removes avoidable timeout overshoot without claiming hard real-time scheduling.
- Consolidate analysis-runner and timed-import Unix process containment into the GUI-independent desktop-core owner, so Tauri orchestration and YouTube import share the same pre-spawn process-group and group-termination semantics instead of carrying two security-sensitive POSIX implementations.
- Fail closed on malformed known YouTube duration metadata before `download=True`; Boolean, non-numeric, non-finite, zero, negative, and non-canonical numeric-subtype duration evidence can no longer authorize a media download through Python numeric coercion or subclass semantics.
- Align YouTube download admission with that same 100 MiB encoded-byte ceiling: abort in-flight with yt-dlp `max_filesize` and a progress hook, reject announced oversize before `download=True`, delete owned `.part` / `.ytdl` / ASCII-indexed `-Frag[0-9]+` siblings from that import directory on abort, reject a completed path that resolves outside the current import cache before post-download validation, cleanup, or success, and delete owned post-download artifacts that still exceed the policy. A 60 MiB import that the old 50 MB check rejected is now accepted; a file one byte over 100 MiB is not.
- Preserve legal `-Frag` text inside an 11-character YouTube video ID during abort cleanup: only a terminal ASCII-decimal yt-dlp fragment suffix (`-Frag[0-9]+` or `-Frag[0-9]+.part`) is normalized, so IDs such as `abc-Frag123` retain their identity while their real `.part-FragN` siblings are still removed and Unicode digit lookalikes do not acquire deletion authority.
- Bound native stored-score PDF reads to the 25 MiB product limit before heap allocation and revalidate PDF magic on the same opened descriptor, preventing an attached score that later grows from bypassing the local resource boundary.
- Treat every zero-element NumPy layout as empty chord input, including shapes whose first dimension is non-zero, before feature extraction.

### Changed

- Consolidated Bandit, dependency audits, supplemental secret checks, and Trivy into one trusted-branch security backstop, delegated CodeQL to GitHub default setup, and removed duplicate local PR security and release-preflight runs.
- Pinned npm `10.9.9` as the approved lockfile generator, activated it through Node-bundled Corepack before dependency consumption, and fail closed unless its bundled `tar` is at least `7.5.19`; primary CI still consumes the committed lock only through frozen `npm ci` validation, rejects mutable npm resolution in the lock gate, requires integrity evidence for public-registry lock entries, and preserves generator-sensitive root `@esbuild/*` peer metadata.

### Fixed

- Upgraded the local score PDF parser to `pdfjs-dist` 6.2.108, pinned Undici 7.29.0 across the workspace, and constrained PDF loading to copied in-memory bytes with a same-origin bundled worker and npm-generated lock provenance.

## [0.1.3] - 2026-04-29

### Fixed

- Published release assets through a tag-driven draft release flow so immutable GitHub Releases include desktop installers, checksums, SBOM, and supplemental inventory before publication.
- Added a supply-chain regression guard that rejects post-publication release asset uploads.

## [0.1.2] - 2026-04-29

### Changed

- Aligned the packaged desktop app version with the release package metadata.

### Fixed

- Stabilized YouTube import fallback behavior in browser and desktop dev paths.
- Guarded OSSF Scorecard execution so release-branch pushes skip unsupported non-default branch runs cleanly.

## [0.1.1] - 2026-04-28

### Added

- Implemented rehearsal workspace design (Issue #107)
- Add capo and tuning detection heuristics (Issue #103)
- Add bandit security scan workflow

### Fixed

- Upgrade pytest to 9.0.3 to fix GHSA-6w46-j5rx-g56g
- Resolve npm audit vulnerabilities
- Fix ruff import sorting and formatting errors
- Add missing docstrings to tests
- Fix test configuration and typing issues

## [0.1.0] - 2026-03-27

### Added

- Issue #29: Defined core `song -> section -> role` rehearsal domain contracts
- Issue #38: Added cross-architecture build support (Windows/macOS arm64+amd64)
- Issue #40: Enforced 100% Python docstring and test coverage
- Issue #32: Implemented local analysis orchestration and secure IPC boundaries
- Issue #33: Implemented secure local audio intake and project bootstrap
- Issue #35: Engineered section, form, and cue anchor extraction pipeline
- Issue #34: Implemented role extraction targets and part graph
- Issue #31: Added role-specific harmony, range, overlap, and confidence metrics
- Issue #28: Delivered practical rehearsal workspace UI
- Issue #27: Supported manual overrides, provenance tracking, and local project persistence
- Issue #36: Implemented rehearsal priority calculation and cue-sheet (CSV) / chart (JSON) exports
- Issue #30: Added policy-constrained YouTube import with local fallback
- Issue #26: Finalized roadmap and prepared application for initial release

## [0.1.4] - 2026-05-15

### 추가됨 (Added)

- `ChordsFeature` (코드 분석) 화면에서 각 파트(Role)의 `transpositionPlan`(이조/조옮김 계획)을 표시하는 기능을 추가했습니다.
- `RangesFeature` (음역대 분석) 화면에서 겹침 경고(Overlap warning) 외에 해당 파트의 채보(Transcription) 가능 노드 수를 요약하여 보여주는 기능을 추가했습니다.
- 신규 UI 요소에 대한 단위 테스트를 추가했습니다 (`apps/desktop/src/features/chords/index.test.tsx`, `apps/desktop/src/features/ranges/index.test.tsx`).
