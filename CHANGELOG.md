# Changelog

## [Unreleased]

### Added

- Add Tier 1 real-audio accuracy acceptance: a decoded C major WAV must recover `C`, and a 120 BPM click WAV must pass tempo Acc1, with checksum-fail-closed reports.

### Fixed

- Reject click-track accuracy fixtures whose beat interval or click pulse cannot be represented by at least one sample, preventing aliased or all-zero tempo evidence from entering acceptance runs.
- Reject fixture timings whose derived sample count overflows or quantizes below one sample, and reject finite BPM inputs whose derived beat interval becomes non-finite, before they can drive real-audio accuracy allocation or loop authority.
- Reject malformed decoded-PCM accuracy evidence before chord recognition: the C-major acceptance buffer must be a non-empty, finite, floating-point, one-dimensional mono array and sample rates must be finite, positive, and non-Boolean.
- Reject accuracy-report metric integers whose conversion overflows floating-point evidence instead of letting an `OverflowError` escape the manifest validation boundary.
- Reject Boolean fixture duration, tempo, and sample-rate inputs so Python `True`/`False` values cannot become numeric real-audio acceptance authority or a 1 Hz WAV contract.
- Reject Boolean chord timing and tempo metric inputs so `True`/`False` cannot masquerade as numeric MIR acceptance evidence through Python's `bool`-as-`int` semantics.
- Reject blank or edge-whitespace-padded accuracy-report case IDs, metric names, and truth labels so portable acceptance evidence preserves exact registered identities.
- Reject empty or reversed chord-estimate intervals before duration-weighted recall so malformed timing evidence cannot be silently ignored by an accuracy acceptance score.
- Fail closed when accuracy-report provenance cannot resolve a non-empty product `VERSION`, instead of publishing an `unknown` engine version as valid evidence.
- Reject non-finite chord annotation and estimate timings before duration-weighted recall so NaN/Inf evidence cannot fabricate covered duration.
- Reject non-finite tempo estimates, ground-truth BPM values, and Acc1 tolerances as invalid accuracy evidence instead of recording them as ordinary misses.
- Union overlapping matching chord-estimate intervals before duration-weighted recall so acceptance scores cannot double-count annotated time or exceed 100%.
- Reject malformed accuracy-report provenance, including non-hex SHA-256 text and non-finite metric values, before acceptance evidence is consumed.
- Score the C major acceptance case from checksummed on-disk WAV bytes instead of the pre-write in-memory triad.
- Display the analyzed song tempo (BPM) as a badge in the rehearsal workspace.
- 각 합주 역할(Role)별 개인 연습 진행도를 0~100% 범위로 기록 및 시각화할 수 있는 연습 진척도(`practiceProgress`) 트래커 기능 추가. UI 컨트롤(슬라이더 및 +/- 버튼)과 한/영 다국어 지원 포함.

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
