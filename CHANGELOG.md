# Changelog

## [Unreleased]

### Changed

- Lock rehearsal metric authority: Le Roux SI-SDR primary, Odekerken/MIREX WCSR, Chiu 2025 ±70 ms beat F-measure, Schreiber/Urbano/Müller Acc1+Acc2 with Acc2-alone forbidden, and Raffel 2014 not cited as an Acc1/Acc2 source. Tempo has no single primary metric; beat/onset admits F-measure only inside the 70 ms window.

### Added

- Added an opt-in real-YouTube/Demucs benchmark that verifies vocal separation against a
  creator-published, SHA-256-pinned known stem without adding media files to the repository.
- Added an independently pinned creator master for YouTube asset identity, full extracted-member
  hashing, composed global offsets, calibrated provisional sentinels, and deterministic Demucs
  inference (`shifts=0`).
- Added canonical PRD, TRD, ADR, architecture/UML/logical-artifact diagrams, traceability, and
  machine-checked documentation coverage for the known-stem quality boundary.
- Replaced the retired FFT-era bandsplit model inventory with the exact htdemucs runtime artifact,
  full SHA-256, byte size, delivery status, verified ffmpeg/ffprobe prerequisites, and release
  blockers.
- Display the analyzed song tempo (BPM) as a badge in the rehearsal workspace.
- 각 합주 역할(Role)별 개인 연습 진행도를 0~100% 범위로 기록 및 시각화할 수 있는 연습 진척도(`practiceProgress`) 트래커 기능 추가. UI 컨트롤(슬라이더 및 +/- 버튼)과 한/영 다국어 지원 포함.

### Fixed

- Rejected POSIX and Windows parent-directory segments at the YouTube download-output boundary
  before the path reaches yt-dlp, returning a stable redacted failure without downloader execution.
- Kept YouTube TLS verification enabled, using populated OS-managed CA roots when available and
  retaining yt-dlp's maintained CA-bundle fallback when the system trust store is empty or fails.
- Made htdemucs loading offline and fail-closed: the runtime accepts only the inventoried filename,
  byte size, and full SHA-256, rejects filesystem identity races, and deserializes the verified
  bytes with PyTorch's restricted `weights_only` loader, an exact reviewed global allowlist, strict
  model construction, and serialized one-time caching rather than downloading a missing checkpoint.
- Verified exact platform-native sibling ffmpeg/ffprobe executable names and identities before any
  live fixture access or yt-dlp invocation.
- Isolated Numba's native-code cache for repository analysis commands so a stale or concurrently
  compiled virtualenv cache cannot crash deterministic verification.
- Reconciled stale CodeRabbit-gate wording with the canonical stable-check and review-equivalent
  policy; qualifying evidence is now defined against the exact current head, and a rate-limited,
  status-only, author, or predecessor review is not treated as completed review evidence.
- Routed root npm/quickcheck Python entry points through a shared Node launcher that selects
  `py -3`, `python3`, or `python` in a deterministic platform-specific order without masking
  interpreter failures.

### Security Notes

- Attack surface and trust boundary: YouTube URLs, response metadata, downloaded media, creator
  fixtures, ffmpeg/ffprobe executables, and htdemucs checkpoint bytes remain untrusted until their
  owning host, shape, size, filesystem identity, and full-hash allowlists pass.
- Mitigations and failure behavior: TLS verification stays enabled; parent-directory segments are
  rejected before the output template reaches yt-dlp; the complete ffmpeg/ffprobe path-and-hash
  pair is verified before network fixture access; model loading is offline, same-byte, restricted
  to `weights_only=True` plus the exact reviewed globals, and fails closed without an unrestricted
  fallback.
- Developer tooling: the cross-platform check launcher is repository-only, invokes only the fixed
  `py`, `python3`, or `python` candidates with argument arrays and no shell, and propagates the first
  available interpreter's failure instead of retrying past it.
- Logging and privacy: raw media, model bytes, separated stems, credentials, and full local paths
  are not retained in release evidence or emitted in bounded operator errors.
- Test points: each candidate head must pass quickcheck, hosted SAST/Bandit/secret/security scans,
  mutation tests for loader and allowlist bypasses, executable-identity rejection tests,
  supply-chain verification, and the exact provisioned-model smoke test before merge.
- Dependency and supply chain: no production dependency is added by this benchmark slice;
  documentation policy checks pin `markdown-it-py 4.0.0` as a direct development dependency so
  rendered Markdown—not lexical lookalikes—defines headings and tables. The shared JavaScript
  dependency-security baseline remains owned by canonical #783 and is a prerequisite gate for this
  branch; the supplemental inventory separately binds yt-dlp, ffmpeg/ffprobe, and htdemucs to their
  declared delivery and integrity contracts.

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
- 신규 UI 요소에 대한 100% 테스트 커버리지를 보장하는 단위 테스트를 추가했습니다 (`apps/desktop/src/features/chords/index.test.tsx`, `apps/desktop/src/features/ranges/index.test.tsx`).
